"use strict";

(function initializeUserWorkspaceEntry(globalObject) {
  const CURRENT_STAGE22_PLANNING_ALGORITHM_VERSION = 11;
  const CURRENT_STAGE22_ALGORITHM_ID = "stage21-confirmed-adapted-execution-plan:v4";
  const ROUTES = Object.freeze({
    PATTERN_IMPORT: "/import-pattern",
    GARMENT_REFERENCE_ANALYSIS: "/garment-reference-analysis",
    PATTERN_ANALYSIS: "/pattern-analysis",
    PATTERN_CONTENT_EXTRACTION: "/pattern-content-extraction",
    PATTERN_SEMANTIC_ANALYSIS: "/pattern-semantic-analysis",
    PATTERN_ANALYSIS_REVIEW: "/pattern-analysis-review",
    PATTERN_TECHNOLOGY_DRAFT: "/pattern-technology-draft",
    PATTERN_TECHNOLOGY_REVIEW: "/pattern-technology-review",
    PATTERN_EXECUTION_PLAN: "/pattern-execution-plan",
    PROJECT_EXECUTION_PLAN_PREPARATION: "/project-execution-plan",
    PROJECT_EXECUTION_START: "/project-execution-start",
    PROJECT_EXECUTION_FIRST_STEP: "/project-execution-first-step",
    PROJECT_EXECUTION_NEXT_STEP_PREPARATION: "/project-execution-next-step",
    PROJECT_EXECUTION_NEXT_STEP_CLARIFICATION: "/project-execution-next-step-clarification",
    FOUNDATION_SECTION_EXECUTION_PREPARATION: "/project-foundation-section-preparation",
    FOUNDATION_SECTION_EXECUTION: "/project-foundation-section-execution",
    FOUNDATION_SECTION_MEASUREMENT: "/project-foundation-section-measurement",
    PRIMARY_FABRIC_PREPARATION: "/project-primary-fabric-preparation",
    PRIMARY_FABRIC_EXECUTION: "/project-primary-fabric-execution",
    PRIMARY_FABRIC_MEASUREMENT: "/project-primary-fabric-measurement",
    PROJECT_NEXT_SECTION_PLANNING: "/project-next-section-planning",
    PROJECT_CONSTRUCTION_STRATEGY_PLANNING: "/project-construction-strategy-planning",
    PROJECT_SHAPING_POLICY_PLANNING: "/project-shaping-policy-planning",
    PROJECT_SLEEVE_TARGET_GEOMETRY_PLANNING: "/project-sleeve-geometry-planning",
    PROJECT_SLEEVE_PHYSICAL_EXECUTION: "/project-sleeve-physical-execution",
    PROJECT_SLEEVE_PAIR_VALIDATION: "/project-sleeve-pair-validation",
    PROJECT_BODY_UNDERARM_PHYSICAL_CONFIRMATION: "/project-body-underarm-physical-confirmation",
    PROJECT_UNDERARM_ALLOCATION_PLANNING: "/project-underarm-allocation-planning",
    PROJECT_JOIN_LAYOUT_PLANNING: "/project-join-layout-planning",
    PROJECT_UNDERARM_ALLOCATION_EXECUTION: "/project-underarm-allocation-execution",
    PROJECT_RAGLAN_INTERFACE_PLANNING: "/project-raglan-interface-planning",
    PROJECT_BODY_SLEEVES_JOIN_EXECUTION: "/project-body-sleeves-join-execution",
    PROJECT_YOKE_TARGET_GEOMETRY_PLANNING: "/project-yoke-target-geometry-planning",
    PROJECT_RAGLAN_SHAPING_SCHEDULE_PLANNING: "/project-raglan-shaping-schedule-planning",
    PROJECT_RAGLAN_SHAPING_EXECUTION: "/project-raglan-shaping-execution",
    PROJECT_NECKLINE_OPENING_PLANNING: "/project-neckline-opening-planning",
    PROJECT_NECKLINE_OPENING_EXECUTION: "/project-neckline-opening-execution",
    PROJECT_REALIZED_FINISHABLE_EDGE_EVIDENCE: "/project-realized-finishable-edge-evidence",
    PATTERN_EXECUTION_SESSION: "/pattern-execution-session",
    PATTERN_EXECUTION_STEP: "/pattern-execution-step",
    PATTERN_EXECUTION_CHECKPOINT: "/pattern-execution-checkpoint",
    PATTERN_EXECUTION_PROGRESS: "/pattern-execution-progress",
    PATTERN_EXECUTION_COMPLETION: "/pattern-execution-completion",
    PATTERN_EXECUTION_RESULT: "/pattern-execution-result",
    PATTERN_EXECUTION_RUNTIME: "/pattern-execution-runtime",
    PATTERN_EXECUTION_MONITORING: "/pattern-execution-monitoring",
    FIRST_KNITTING_STEP: "/step-assistant",
    FIRST_FABRIC_SECTION: "/section-assistant",
    FIRST_SIMPLE_SHAPING: "/shaping-assistant",
    FIRST_BIND_OFF: "/bind-off-assistant",
    SECOND_IDENTICAL_PIECE: "/second-piece-assistant",
    FIRST_ASSEMBLY_JOIN: "/first-assembly-join",
    FIRST_ASSEMBLY_INSPECTION: "/first-assembly-inspection",
    FIRST_TAIL_SECURING: "/first-tail-securing",
    FIRST_BLOCKING: "/first-blocking",
    GARMENT_POLO_EXECUTION: "/garment-polo-execution",
  });

  const ROUTE_PRIORITY = Object.freeze(Object.keys(ROUTES));
  const CREATE_PROJECT_ACTION_ID = "create-project";
  const WORKSPACE_ACTION_ROUTES = Object.freeze({
    "PROJECT_EXECUTION_PLAN_PREPARATION": "/project-execution-plan",
    "PROJECT_EXECUTION_START": "/project-execution-start",
    "PROJECT_EXECUTION_FIRST_STEP": "/project-execution-first-step",
    "PROJECT_EXECUTION_NEXT_STEP_PREPARATION": "/project-execution-next-step",
    "PROJECT_EXECUTION_NEXT_STEP_CLARIFICATION": "/project-execution-next-step-clarification",
    "FOUNDATION_SECTION_EXECUTION_PREPARATION": "/project-foundation-section-preparation",
    "FOUNDATION_SECTION_EXECUTION": "/project-foundation-section-execution",
    "FOUNDATION_SECTION_MEASUREMENT": "/project-foundation-section-measurement",
    "PRIMARY_FABRIC_PREPARATION": "/project-primary-fabric-preparation",
    "PRIMARY_FABRIC_EXECUTION": "/project-primary-fabric-execution",
    "PRIMARY_FABRIC_MEASUREMENT": "/project-primary-fabric-measurement",
    "PROJECT_NEXT_SECTION_PLANNING": "/project-next-section-planning",
    "PROJECT_CONSTRUCTION_STRATEGY_PLANNING": "/project-construction-strategy-planning",
    "PROJECT_SHAPING_POLICY_PLANNING": "/project-shaping-policy-planning",
    "PROJECT_SLEEVE_TARGET_GEOMETRY_PLANNING": "/project-sleeve-geometry-planning",
    "PROJECT_SLEEVE_PHYSICAL_EXECUTION": "/project-sleeve-physical-execution",
    "PROJECT_SLEEVE_PAIR_VALIDATION": "/project-sleeve-pair-validation",
    "PROJECT_BODY_UNDERARM_PHYSICAL_CONFIRMATION": "/project-body-underarm-physical-confirmation",
    "PROJECT_UNDERARM_ALLOCATION_PLANNING": "/project-underarm-allocation-planning",
    "PROJECT_JOIN_LAYOUT_PLANNING": "/project-join-layout-planning",
    "PROJECT_UNDERARM_ALLOCATION_EXECUTION": "/project-underarm-allocation-execution",
    "PROJECT_RAGLAN_INTERFACE_PLANNING": "/project-raglan-interface-planning",
      "PROJECT_BODY_SLEEVES_JOIN_EXECUTION": "/project-body-sleeves-join-execution",
      "PROJECT_YOKE_TARGET_GEOMETRY_PLANNING": "/project-yoke-target-geometry-planning",
      "PROJECT_RAGLAN_SHAPING_SCHEDULE_PLANNING": "/project-raglan-shaping-schedule-planning",
      "PROJECT_RAGLAN_SHAPING_EXECUTION": "/project-raglan-shaping-execution",
      "PROJECT_NECKLINE_OPENING_PLANNING": "/project-neckline-opening-planning",
      "PROJECT_NECKLINE_OPENING_EXECUTION": "/project-neckline-opening-execution",
      "PROJECT_REALIZED_FINISHABLE_EDGE_EVIDENCE": "/project-realized-finishable-edge-evidence",
    "SMART_START": "/project-calculation-entry",
    "STEP_ASSISTANT": "/step-assistant",
    "FIRST_FABRIC_SECTION": "/section-assistant",
    "FIRST_SIMPLE_SHAPING": "/shaping-assistant",
    "FIRST_BIND_OFF": "/bind-off-assistant",
    "SECOND_IDENTICAL_PIECE": "/second-piece-assistant",
    "FIRST_ASSEMBLY_JOIN": "/first-assembly-join",
    "FIRST_ASSEMBLY_INSPECTION": "/first-assembly-inspection",
    "FIRST_TAIL_SECURING": "/first-tail-securing",
    "FIRST_BLOCKING": "/first-blocking",
    "GARMENT_REFERENCE_ANALYSIS": "/garment-reference-analysis",
    "GARMENT_POLO_EXECUTION": "/garment-polo-execution",
    "PATTERN_EXECUTION_PLAN": "/pattern-execution-plan",
    "PATTERN_EXECUTION_SESSION": "/pattern-execution-session",
    "PATTERN_EXECUTION_STEP": "/pattern-execution-step",
    "PATTERN_EXECUTION_CHECKPOINT": "/pattern-execution-checkpoint",
    "PATTERN_EXECUTION_PROGRESS": "/pattern-execution-progress",
    "PATTERN_EXECUTION_RUNTIME": "/pattern-execution-runtime",
    "PATTERN_EXECUTION_MONITORING": "/pattern-execution-monitoring",
  });
  const MATERIAL_MIME_ALLOWLIST = Object.freeze([
    "application/pdf",
    "text/plain",
    "text/markdown",
    "image/",
  ]);

  function buildPrimaryActionModel() {
    return {
      eyebrow: "Новая вещь",
      title: "Хочу связать вот это",
      description: "Фото, схема, PDF или обычное описание",
      actionId: CREATE_PROJECT_ACTION_ID,
      actionLabel: "Начать новый проект",
      destination: ROUTES.PATTERN_IMPORT,
    };
  }

  function buildLatestProjectPresentation(project) {
    const terminal = isRecord(project) && text(project.title) && text(project.summary) && !project.action;
    if (!isRecord(project) || !text(project.title) || !isRecord(project.action) && !terminal) {
      return {
        available: false,
        heading: "Продолжить работу",
        description: "Здесь появится проект, к которому можно быстро вернуться.",
        action: null,
      };
    }
    if (terminal) {
      return {
        available: true,
        heading: "Последний проект",
        title: text(project.title),
        description: [text(project.type), text(project.state), text(project.summary)].filter(Boolean).join(" · "),
        action: null,
      };
    }
    return {
      available: true,
      heading: "Продолжить работу",
      title: text(project.title),
      description: [text(project.type), text(project.state)].filter(Boolean).join(" · ") ||
        "Проект готов к открытию",
      action: {
        label: text(project.action.label) || "Открыть проект",
        href: text(project.action.href) || "#saved-projects",
      },
    };
  }

  function isRecord(value) {
    return Boolean(value) && typeof value === "object" && !Array.isArray(value);
  }

  function text(value) {
    return typeof value === "string" && value.trim() ? value.trim() : null;
  }

  function validTimestamp(value) {
    if (typeof value !== "string" || !value.trim()) {
      return null;
    }
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  function projectIdOf(project) {
    return text(project?.project_id) || text(project?.id);
  }

  function progressProjectId(record) {
    return text(record?.project_id) || text(record?.projectId);
  }

  function stateOf(record) {
    return isRecord(record?.state) ? record.state : {};
  }

  function isUnsafeProgress(record) {
    const state = stateOf(record);
    const validation = String(record?.validation_status || "").toUpperCase();
    return Boolean(
      (record?.state !== undefined && !isRecord(record.state)) ||
        record?.quarantined ||
        state.quarantined ||
        validation === "QUARANTINED" ||
        record?.imported_unproven ||
        record?.importedUnproven ||
        state.imported_unproven ||
        state.importedUnproven ||
        record?.stale ||
        state.stale ||
        String(record?.status || "").toLowerCase() === "stale" ||
        String(state.status || "").toLowerCase() === "stale",
    );
  }

  function latestProgress(records) {
    if (!records.length) {
      return null;
    }
    return records.reduce((selected, candidate, index) => {
      const candidateTime =
        validTimestamp(candidate?.updated_at) ??
        validTimestamp(candidate?.created_at);
      const selectedTime =
        validTimestamp(selected.record?.updated_at) ??
        validTimestamp(selected.record?.created_at);
      if (candidateTime !== null && selectedTime !== null) {
        return candidateTime > selectedTime ? { record: candidate, index } : selected;
      }
      if (candidateTime !== null && selectedTime === null) {
        return { record: candidate, index };
      }
      return index > selected.index ? { record: candidate, index } : selected;
    }, { record: records[0], index: 0 }).record;
  }

  function routeProgress(records) {
    const activeTechnologyReview = latestProgress(records.filter(activeTechnologyReviewReadyForRouting));
    if (activeTechnologyReview) return activeTechnologyReview;
    const virtualSession = latestProgress(records.filter((record) => record?.kind === "PATTERN_EXECUTION_SESSION" && record?.state?.virtualDryRun?.started === true && ["active", "completed"].includes(record.state.virtualDryRun.status)));
    if (virtualSession) return virtualSession;
    const readyExecutionPlan = latestProgress(records.filter(executionPlanReadyForRouting));
    if (readyExecutionPlan) return readyExecutionPlan;
    const technologyDrafts = records.filter((record) => record?.kind === "PATTERN_TECHNOLOGY_DRAFT");
    const incompleteDraft = latestProgress(technologyDrafts.filter(technologyDraftIsIncomplete));
    if (incompleteDraft) return incompleteDraft;
    for (let index = ROUTE_PRIORITY.length - 1; index >= 0; index -= 1) {
      const kind = ROUTE_PRIORITY[index];
      const matches = records.filter((record) => record?.kind === kind);
      if (matches.length) {
        return latestProgress(matches);
      }
    }
    return latestProgress(records);
  }

  function executionPlanReadyForRouting(record) {
    const state = record?.state;
    const plan = state?.plan;
    return Boolean(
      record?.kind === "PATTERN_EXECUTION_PLAN" &&
      state?.status === "ready" &&
      Number.isInteger(state?.revision) &&
      /^fnv1a32:[0-9a-f]{8}$/.test(String(state?.planFingerprint || "")) &&
      state?.validation?.isValid === true &&
      state?.validation?.validatedRevision === state.revision &&
      state?.planningAlgorithmVersion === CURRENT_STAGE22_PLANNING_ALGORITHM_VERSION &&
      plan?.contractId === "PATTERN_EXECUTION_PLAN_V2" &&
      plan?.resultKind === "PATTERN_EXECUTION_PLAN_RESULT" &&
      plan?.algorithmId === CURRENT_STAGE22_ALGORITHM_ID &&
      /^fnv1a32:[0-9a-f]{8}$/.test(String(plan?.resultFingerprint || "")) &&
      Array.isArray(plan?.steps) &&
      plan.steps.length === 127 &&
      plan?.coverage?.sourceOperationCount === 127 &&
      plan?.coverage?.userStepCount === 127 &&
      plan?.coverage?.exactOneToOne === true &&
      plan?.initialExecutionState?.status === "ready_to_start" &&
      plan?.initialExecutionState?.started === false &&
      plan?.initialExecutionState?.completedStepCount === 0 &&
      plan?.firstAction?.ready === true
    );
  }

  function executionPlanAvailableForStaleRouting(record) {
    const state = record?.state;
    const plan = state?.plan;
    return Boolean(
      record?.kind === "PATTERN_EXECUTION_PLAN" &&
      ["ready", "stale"].includes(state?.status) &&
      Number.isInteger(state?.revision) && state.revision > 0 &&
      /^fnv1a32:[0-9a-f]{8}$/.test(String(state?.planFingerprint || "")) &&
      plan?.contractId === "PATTERN_EXECUTION_PLAN_V2" &&
      plan?.resultKind === "PATTERN_EXECUTION_PLAN_RESULT" &&
      /^fnv1a32:[0-9a-f]{8}$/.test(String(plan?.resultFingerprint || "")) &&
      Array.isArray(plan?.steps) &&
      plan.steps.length === 127 &&
      plan?.coverage?.sourceOperationCount === 127 &&
      plan?.coverage?.userStepCount === 127 &&
      plan?.coverage?.exactOneToOne === true &&
      plan?.initialExecutionState?.status === "ready_to_start" &&
      plan?.initialExecutionState?.started === false &&
      plan?.initialExecutionState?.completedStepCount === 0 &&
      typeof plan?.firstAction?.ready === "boolean"
    );
  }

  function executionPlanStaleAgainstReview(planRecord, reviewRecord) {
    return Boolean(
      planRecord?.kind === "PATTERN_EXECUTION_PLAN" &&
      reviewRecord?.kind === "PATTERN_TECHNOLOGY_REVIEW" &&
      (
        planRecord.state?.status === "stale" ||
        !executionPlanReadyForRouting(planRecord) ||
        planRecord.state?.sourceTechnologyReviewRevision !== reviewRecord.state?.revision ||
        planRecord.state?.sourceConfirmedSnapshotFingerprint !== reviewRecord.state?.confirmedSnapshotFingerprint
      )
    );
  }

  function activeTechnologyReviewReadyForRouting(record) {
    const state = record?.state;
    const snapshot = state?.immutableSourceSnapshot;
    const executable = snapshot?.executableTechnologyPlanInput;
    return Boolean(
      record?.kind === "PATTERN_TECHNOLOGY_REVIEW" &&
      !isUnsafeProgress(record) &&
      ["waiting", "reviewing", "needs_attention"].includes(state?.status) &&
      state?.version === 1 &&
      state?.reviewAlgorithmVersion === 1 &&
      Number.isInteger(state?.revision) && state.revision > 0 &&
      snapshot?.schemaVersion === 2 &&
      /^fnv1a32:[0-9a-f]{8}$/.test(String(state?.immutableSourceSnapshotFingerprint || "")) &&
      state?.executableInputSchemaId === "EXECUTABLE_TECHNOLOGY_PLAN_INPUT_V1" &&
      state?.executableInputVersion === 1 &&
      state?.executableInputIdentity === executable?.identity &&
      state?.executableInputFingerprint === executable?.fingerprint &&
      /^executable-technology-plan-input:/.test(String(executable?.identity || "")) &&
      /^fnv1a32:[0-9a-f]{8}$/.test(String(executable?.fingerprint || "")) &&
      executable?.algorithmId === "stage20-v2-branch-resolved-adapted-execution:v6" &&
      executable?.readiness?.executableReady === true &&
      state?.validation?.validatedRevision === state.revision &&
      Array.isArray(state?.validation?.critical)
    );
  }

  function completedTechnologyReviewReadyForViewing(record) {
    const state = record?.state;
    return Boolean(
      record?.kind === "PATTERN_TECHNOLOGY_REVIEW" &&
      !isUnsafeProgress(record) &&
      state?.status === "confirmed" &&
      Number.isInteger(state?.revision) && state.revision > 0 &&
      state?.confirmedSnapshot &&
      /^fnv1a32:[0-9a-f]{8}$/.test(String(state?.confirmedSnapshotFingerprint || "")) &&
      state?.immutableSourceSnapshot &&
      Array.isArray(state?.decisions) &&
      state.decisions.length > 0 &&
      state.decisions.every((entry) => entry?.decision && entry.decision !== "pending")
    );
  }

  function completedTechnologyReviewAction(records, projectId) {
    const review = latestProgress((Array.isArray(records) ? records : []).filter(completedTechnologyReviewReadyForViewing));
    if (!review) return null;
    const destination = projectRoute(ROUTES.PATTERN_TECHNOLOGY_REVIEW, projectId);
    return destination ? {
      label: "Посмотреть принятую адаптацию",
      href: `${destination}&view=completed`,
    } : null;
  }

  function technologyDraftIsIncomplete(record) {
    const result = record?.state?.draftResult;
    return isRecord(result) && [result.components, result.operations, result.rowInstructions, result.finishing].some((items) => !Array.isArray(items) || items.length === 0);
  }

  function humanState(project, progress, unsafe) {
    if (!project.workspace_unavailable && !unsafe && progress?.kind === "PROJECT_SLEEVE_TARGET_GEOMETRY_PLANNING") {
      const lifecycle = progress.state?.lifecycle;
      if (lifecycle === "completed") return "План геометрии рукава подтверждён";
      if (lifecycle === "reviewing") return "План геометрии рукава на проверке";
      return "Собираются цели геометрии рукава";
    }
    if (!project.workspace_unavailable && !unsafe && progress?.kind === "PROJECT_SHAPING_POLICY_PLANNING") return "Формирование реглана подтверждено";
    if (!project.workspace_unavailable && !unsafe && progress?.kind === "PROJECT_CONSTRUCTION_STRATEGY_PLANNING") return "Конструкция верха подтверждена";
    if (!project.workspace_unavailable && !unsafe && progress?.kind === "PROJECT_NEXT_SECTION_PLANNING") return "Направление конструкции подтверждено";
    if (!project.workspace_unavailable && !unsafe && project.workspace_primary_fabric_execution_status === "active") return "Основное полотно в работе";
    if (!project.workspace_unavailable && !unsafe && project.workspace_primary_fabric_execution_status === "paused") return "Основное полотно приостановлено";
    if (!project.workspace_unavailable && !unsafe && project.workspace_primary_fabric_execution_status === "ready") return "Основное полотно готово к началу";
    if (!project.workspace_unavailable && !unsafe && project.workspace_primary_fabric_execution_status === "blocked") return "Выполнение основного полотна недоступно";
    if (!project.workspace_unavailable && !unsafe && project.workspace_primary_fabric_preparation_status === "completed") return "Основное полотно подготовлено";
    if (!project.workspace_unavailable && !unsafe && project.workspace_primary_fabric_preparation_status === "ready") return "Нужно подготовить основное полотно";
    if (!project.workspace_unavailable && !unsafe && project.workspace_primary_fabric_preparation_status === "blocked") return "Подготовка основного полотна недоступна";
    if (!project.workspace_unavailable && !unsafe && project.workspace_foundation_measurement_status === "collecting") return "Нужно ввести измеренную высоту";
    if (!project.workspace_unavailable && !unsafe && project.workspace_foundation_measurement_status === "reviewing") return "Нужно сохранить измеренную высоту";
    if (!project.workspace_unavailable && !unsafe && project.workspace_foundation_measurement_status === "completed_target") return "Целевая высота резинки подтверждена";
    if (!project.workspace_unavailable && !unsafe && project.workspace_foundation_measurement_status === "completed_below") return "Высота измерена — продолжите вязание";
    if (!project.workspace_unavailable && !unsafe && project.workspace_foundation_measurement_status === "blocked") return "История измерений требует проверки";
    if (!project.workspace_unavailable && !unsafe && project.workspace_foundation_execution_status === "active") return "Резинка в работе";
    if (!project.workspace_unavailable && !unsafe && project.workspace_foundation_execution_status === "paused") return "Выполнение резинки приостановлено";
    if (!project.workspace_unavailable && !unsafe && project.workspace_foundation_execution_status === "ready") return "Резинка готова к началу";
    if (!project.workspace_unavailable && !unsafe && project.workspace_foundation_preparation_status === "completed") return "Подготовка резинки завершена";
    if (!project.workspace_unavailable && !unsafe && ["collecting", "reviewing", "ready"].includes(project.workspace_foundation_preparation_status)) return "Нужно подготовить резинку";
    if (!project.workspace_unavailable && !unsafe && ["blocked", "stale"].includes(project.workspace_foundation_preparation_status)) return "Подготовка резинки недоступна";
    if (project.workspace_unavailable || unsafe) {
      return "Открыть проект";
    }
    if (project.workspace_continuation?.status === "pending" || project.workspace_stage69_status === "completed") return "Следующий шаг подготовлен";
    if (project.workspace_stage69_status === "ready") return "Нужно уточнить следующий шаг";
    if (project.workspace_stage69_status === "blocked") return "Уточнение недоступно";
    if (["prepared", "unavailable"].includes(project.workspace_stage68_status)) {
      return project.workspace_stage68_status === "prepared" ? "Следующий шаг подготовлен" : "Следующий шаг требует уточнений";
    }
    if (project.workspace_stage68_status === "blocked") return "Следующий шаг заблокирован";
    if (project.workspace_stage67_status === "completed") {
      return "\u041f\u0435\u0440\u0432\u044b\u0439 \u0448\u0430\u0433 \u0437\u0430\u0432\u0435\u0440\u0448\u0451\u043d";
    }
    if (["ready", "active", "paused", "checking"].includes(project.workspace_stage67_status)) {
      return "\u041f\u0435\u0440\u0432\u044b\u0439 \u0448\u0430\u0433 \u0432 \u0440\u0430\u0431\u043e\u0442\u0435";
    }
    if (project.workspace_stage67_status === "blocked") {
      return "\u041f\u0435\u0440\u0432\u044b\u0439 \u0448\u0430\u0433 \u0437\u0430\u0431\u043b\u043e\u043a\u0438\u0440\u043e\u0432\u0430\u043d";
    }
    if (project.workspace_stage66_status === "started") {
      return "Выполнение начато";
    }
    if (project.workspace_stage66_status === "ready") {
      return "Можно подготовиться к началу";
    }
    if (project.workspace_stage66_status === "blocked") {
      return "Начало заблокировано";
    }
    if (project.workspace_stage65_ready === true) {
      return project.workspace_stage65_completed ? "План работы подтверждён" : "Можно подготовить план работы";
    }
    if (project.workspace_stage65_problem) {
      return "Нужно проверить исходные данные плана";
    }
    const kind = String(progress?.kind || "");
    const state = stateOf(progress);
    const status = String(state.status || state.lifecycle || "").toLowerCase();
    if (kind === "PATTERN_TECHNOLOGY_REVIEW" && activeTechnologyReviewReadyForRouting(progress)) return "Проверка обновлённого плана не завершена";
    if (kind === "PATTERN_TECHNOLOGY_DRAFT" && technologyDraftIsIncomplete(progress)) return "Технологический план ещё не построен";
    if (kind === "PATTERN_IMPORT") {
      return status === "completed" ? "Материалы загружены" : "Нужно закончить настройку";
    }
    if (kind === "GARMENT_REFERENCE_ANALYSIS") {
      if (status === "selected") return "Технология по фотографии выбрана";
      if (status === "needs_changes") return "Нужно изменить предложенную технологию";
      if (status === "stale") return "Анализ фотографий устарел";
      return "Фотографии и решение сохранены";
    }
    if (kind === "GARMENT_POLO_EXECUTION") return status === "completed_reported" ? "Поло отмечено завершённым пользователем" : "Поло: место вязания сохранено";
    if (/PATTERN_(ANALYSIS|CONTENT_EXTRACTION|SEMANTIC_ANALYSIS|ANALYSIS_REVIEW)/.test(kind)) {
      return "Нужно проверить разбор";
    }
    if (kind === "PATTERN_EXECUTION_PLAN") {
      return "План вязания готов";
    }
    if (kind === "PATTERN_EXECUTION_SESSION" && state.virtualDryRun?.started === true) {
      return state.virtualDryRun.status === "completed" ? "Виртуальная проверка завершена" : `Виртуальная проверка: ${state.virtualDryRun.completedStepIds?.length || 0} из ${state.virtualDryRun.execution?.actions?.length || 0}`;
    }
    if (/PATTERN_TECHNOLOGY_(DRAFT|REVIEW)/.test(kind)) {
      return "Можно начинать вязание";
    }
    if (/PATTERN_EXECUTION_(CHECKPOINT|EVIDENCE|VERIFICATION)/.test(kind)) {
      return "Ожидается проверка шага";
    }
    if (/PATTERN_EXECUTION_(COMPLETION|RESULT)/.test(kind) && /complete|approved|accepted|closed/.test(status)) {
      return "Проект завершён";
    }
    if (/PATTERN_EXECUTION_|FIRST_|SECOND_/.test(kind)) {
      return "Проект в работе";
    }
    if (kind) {
      return "Открыть проект";
    }
    const stage = String(project.current_stage || "").toLowerCase();
    if (/checkpoint|verification|inspection/.test(stage)) {
      return "Ожидается проверка шага";
    }
    if (/complete|finished|closed/.test(stage)) {
      return "Проект завершён";
    }
    if (stage) {
      return "Проект в работе";
    }
    return "Нужно закончить настройку";
  }

  function typeLabel(project) {
    const intent = projectIntentOf(project);
    return (
      text(project.garment_type) ||
      text(project.garmentType) ||
      text(intent.garment_type) ||
      text(intent.garmentType) ||
      text(project.project_intent?.garment_type) ||
      text(project.draft_input?.garment_type) ||
      text(project.description) ||
      null
    );
  }

  function displayTitle(project) {
    const title = text(project?.title);
    if (/^Stage\s*63\s*[—–-]\s*контрольн(?:ый|ого)\s+образ/i.test(title)) {
      const garment = typeLabel(project);
      return garment ? `Проект: ${garment}` : "Проект вязания";
    }
    return title || "Проект без названия";
  }

  function continueLabel(progress) {
    const kind = String(progress?.kind || "");
    if (kind === "PATTERN_TECHNOLOGY_REVIEW" && activeTechnologyReviewReadyForRouting(progress)) return "Продолжить проверку изменений";
    if (kind === "PATTERN_TECHNOLOGY_DRAFT" && technologyDraftIsIncomplete(progress)) return "Открыть способ вязания";
    if (kind === "PATTERN_IMPORT") {
      return "Загрузить материалы";
    }
    if (kind === "GARMENT_REFERENCE_ANALYSIS") return "Открыть технологии по фото";
    if (kind === "GARMENT_POLO_EXECUTION") return "Продолжить поло";
    if (/PATTERN_(ANALYSIS|CONTENT_EXTRACTION|SEMANTIC_ANALYSIS|ANALYSIS_REVIEW)/.test(kind)) {
      return "Проверить разбор";
    }
    if (kind === "PATTERN_EXECUTION_PLAN") return "Открыть план вязания";
    if (kind === "PATTERN_EXECUTION_SESSION" && stateOf(progress).virtualDryRun?.started === true) return stateOf(progress).virtualDryRun.status === "completed" ? "Открыть результат проверки" : "Продолжить виртуальную проверку";
    if (/PATTERN_TECHNOLOGY_(DRAFT|REVIEW)/.test(kind)) {
      return "Начать вязание";
    }
    if (/PATTERN_EXECUTION_|FIRST_|SECOND_/.test(kind)) {
      return "Вернуться к шагу";
    }
    return "Продолжить";
  }

  function projectIntentOf(project) {
    return project?.draft_input?.project_intent
      || project?.draft_input?.projectIntent
      || project?.project_intent
      || project?.projectIntent
      || {};
  }

  function hasConfirmedGauge(intent) {
    return Boolean(
      intent?.gaugeKnown === true
      && Number(intent?.gauge?.stitches) > 0
      && Number(intent?.gauge?.widthCm) > 0,
    );
  }

  function actionFor(project, progress, unsafe) {
    const projectId = projectIdOf(project);
    if (!project.workspace_unavailable && !unsafe && progress?.kind === "PROJECT_SLEEVE_TARGET_GEOMETRY_PLANNING") {
      try {
        const state = globalObject.YarnAIProjectSleeveTargetGeometryPlanning?.validateState(progress.state);
        if (!state || state.lifecycle === "completed") return null;
        return { label: "Продолжить геометрию рукава", href: projectRoute("/project-sleeve-geometry-planning", projectId), canContinue: true };
      } catch { return null; }
    }
    if (!project.workspace_unavailable && !unsafe && progress?.kind === "PROJECT_SHAPING_POLICY_PLANNING") return { label: "Подготовить геометрию рукава", href: projectRoute("/project-sleeve-geometry-planning", projectId), canContinue: true };
    if (!project.workspace_unavailable && !unsafe && progress?.kind === "PROJECT_CONSTRUCTION_STRATEGY_PLANNING") {
      const identity = progress.state?.snapshot?.clarification?.strategyIdentity;
      return { label: identity === "construction-strategy:body-sleeves-joined-raglan:v1" ? "Выбрать формирование реглана" : "Открыть конструкцию верха", href: projectRoute(identity === "construction-strategy:body-sleeves-joined-raglan:v1" ? "/project-shaping-policy-planning" : "/project-construction-strategy-planning", projectId), canContinue: true };
    }
    if (!project.workspace_unavailable && !unsafe && progress?.kind === "PROJECT_NEXT_SECTION_PLANNING") return { label: "Выбрать конструкцию верха", href: projectRoute("/project-construction-strategy-planning", projectId), canContinue: true };
    if (!project.workspace_unavailable && !unsafe && ["ready", "active", "paused"].includes(project.workspace_primary_fabric_execution_status)) return { label: project.workspace_primary_fabric_execution_status === "ready" ? "Начать основное полотно" : "Вернуться к основному полотну", href: projectRoute("/project-primary-fabric-execution", projectId), canContinue: true };
    if (!project.workspace_unavailable && !unsafe && project.workspace_primary_fabric_execution_status === "blocked") return null;
    if (!project.workspace_unavailable && !unsafe && ["ready", "completed"].includes(project.workspace_primary_fabric_preparation_status)) return { label: project.workspace_primary_fabric_preparation_status === "completed" ? "Открыть подготовку основного полотна" : "Подготовить основное полотно", href: projectRoute("/project-primary-fabric-preparation", projectId), canContinue: true };
    if (!project.workspace_unavailable && !unsafe && project.workspace_primary_fabric_preparation_status === "blocked") return null;
    if (!project.workspace_unavailable && !unsafe && ["collecting", "reviewing", "completed_target"].includes(project.workspace_foundation_measurement_status)) return { label: project.workspace_foundation_measurement_status === "completed_target" ? "Открыть подтверждённое измерение" : "Вернуться к измерению", href: projectRoute("/project-foundation-section-measurement", projectId), canContinue: true };
    if (!project.workspace_unavailable && !unsafe && project.workspace_foundation_measurement_ready === true) return { label: "Измерить высоту резинки", href: projectRoute("/project-foundation-section-measurement", projectId), canContinue: true };
    if (!project.workspace_unavailable && !unsafe && project.workspace_foundation_measurement_status === "completed_below") return { label: "Продолжить вязать резинку", href: projectRoute("/project-foundation-section-execution", projectId), canContinue: true };
    if (!project.workspace_unavailable && !unsafe && project.workspace_foundation_measurement_status === "blocked") return null;
    if (!project.workspace_unavailable && !unsafe && ["ready", "active", "paused"].includes(project.workspace_foundation_execution_status)) return { label: project.workspace_foundation_execution_status === "ready" ? "Начать вязать резинку" : "Вернуться к вязанию резинки", href: projectRoute("/project-foundation-section-execution", projectId), canContinue: true };
    if (!project.workspace_unavailable && !unsafe && project.workspace_foundation_preparation_status === "completed") return { label: "Начать вязать резинку", href: projectRoute("/project-foundation-section-execution", projectId), canContinue: true };
    if (!project.workspace_unavailable && !unsafe && ["collecting", "reviewing", "ready"].includes(project.workspace_foundation_preparation_status)) return { label: "Подготовить резинку", href: projectRoute("/project-foundation-section-preparation", projectId), canContinue: true };
    if (!project.workspace_unavailable && !unsafe && ["blocked", "stale"].includes(project.workspace_foundation_preparation_status)) return null;
    const neutral = {
      label: "Открыть проект",
      href: projectRoute("/user-workspace-entry", projectId),
      canContinue: false,
    };
    if (project.workspace_unavailable || unsafe) {
      return neutral;
    }
    if (project.workspace_continuation?.status === "pending" || project.workspace_stage69_status === "completed") {
      return null;
    }
    if (project.workspace_continuation?.status === "blocked" || project.workspace_stage69_status === "blocked") {
      return null;
    }
    if (project.workspace_continuation?.status === "ready" || project.workspace_stage69_status === "ready") {
      return { label: "Уточнить следующий шаг", href: projectRoute("/project-execution-next-step-clarification", projectId), canContinue: true };
    }    if (["prepared", "unavailable"].includes(project.workspace_stage68_status) || project.workspace_stage67_status === "completed") {
      return { label: "Открыть следующий шаг", href: projectRoute("/project-execution-next-step", projectId), canContinue: true };
    }
    if (project.workspace_stage68_status === "blocked") {
      return { label: "Проверить следующий шаг", href: "/saved-projects", canContinue: true };
    }
    if (["ready", "active", "paused", "checking"].includes(project.workspace_stage67_status)) {
      return {
        label: "\u041f\u0435\u0440\u0435\u0439\u0442\u0438 \u043a \u043f\u0435\u0440\u0432\u043e\u043c\u0443 \u0448\u0430\u0433\u0443",
        href: projectRoute("/project-execution-first-step", projectId),
        canContinue: true,
      };
    }
    if (project.workspace_stage67_status === "blocked") {
      return {
        label: project.workspace_stage67_problem?.label || "\u041f\u0440\u043e\u0432\u0435\u0440\u0438\u0442\u044c \u043f\u0435\u0440\u0432\u044b\u0439 \u0448\u0430\u0433",
        href: project.workspace_stage67_problem?.href || "/saved-projects",
        canContinue: true,
      };
    }
    if (project.workspace_stage66_status === "started") {
      return {
        label: "Открыть начатое выполнение",
        href: projectRoute("/project-execution-start", projectId),
        canContinue: true,
      };
    }
    if (project.workspace_stage66_status === "ready") {
      return {
        label: "Подготовиться к началу",
        href: projectRoute("/project-execution-start", projectId),
        canContinue: true,
      };
    }
    if (project.workspace_stage66_status === "blocked") {
      return {
        label: project.workspace_stage66_problem?.label || "Проверить причину блокировки",
        href: project.workspace_stage66_problem?.href || projectRoute("/project-execution-start", projectId),
        canContinue: true,
      };
    }
    if (project.workspace_stage65_problem) {
      return {
        label: project.workspace_stage65_problem.label || "Проверить исходные данные",
        href: project.workspace_stage65_problem.href || neutral.href,
        canContinue: true,
      };
    }
    if (project.workspace_stage65_ready === true) {
      return {
        label: project.workspace_stage65_completed ? "\u041e\u0442\u043a\u0440\u044b\u0442\u044c \u043f\u043e\u0434\u0442\u0432\u0435\u0440\u0436\u0434\u0451\u043d\u043d\u044b\u0439 \u043f\u043b\u0430\u043d" : "\u041f\u043e\u0434\u0433\u043e\u0442\u043e\u0432\u0438\u0442\u044c \u043f\u043b\u0430\u043d \u0440\u0430\u0431\u043e\u0442\u044b",
        href: projectRoute("/project-execution-plan", projectId),
        canContinue: true,
      };
    }
    if (progress?.kind === "PROJECT_EXECUTION_NEXT_STEP_CLARIFICATION") {
      return null;
    }
    if (/^PATTERN_(ANALYSIS|CONTENT_EXTRACTION|SEMANTIC_ANALYSIS|ANALYSIS_REVIEW)$/.test(String(progress?.kind || ""))) {
      return {
        label: "Проверить разбор",
        href: projectRoute(ROUTES.PATTERN_ANALYSIS, projectId),
        canContinue: true,
      };
    }
    const route = ROUTES[progress?.kind];
    if (!route || String(progress?.kind || "").startsWith("PATTERN_EVOLUTION_")) {
      const confirmedGauge = hasConfirmedGauge(projectIntentOf(project));
      return {
        label: progress ? "Открыть проект" : "Продолжить настройку",
        href: confirmedGauge
          ? projectRoute("/project-calculation-entry", projectId)
          : neutral.href,
        canContinue: !progress,
      };
    }
    return {
      label: continueLabel(progress),
      href: progress?.kind === "PATTERN_EXECUTION_SESSION" && progress?.state?.virtualDryRun?.started === true ? progressDestination(progress, projectId) : `${route}?project=${encodeURIComponent(projectId)}`,
      canContinue: true,
    };
  }

  function compareRecency(left, right) {
    if (left.orderTime !== null && right.orderTime !== null && left.orderTime !== right.orderTime) {
      return right.orderTime - left.orderTime;
    }
    if (left.orderTime !== null && right.orderTime === null) {
      return -1;
    }
    if (left.orderTime === null && right.orderTime !== null) {
      return 1;
    }
    if (left.revision !== right.revision) {
      return right.revision - left.revision;
    }
    if (left.sourceIndex !== right.sourceIndex) {
      return left.sourceIndex - right.sourceIndex;
    }
    return left.id.localeCompare(right.id);
  }

  function buildProjectCard(project, records, sourceIndex) {
    const id = projectIdOf(project);
    const readyPatternProgress = compatibleReadyPatternExecutionProgress(records, id);
    const compatiblePatternProgress = readyPatternProgress || compatiblePatternExecutionProgress(records, id);
    const stalePatternPlan = Boolean(compatiblePatternProgress?.kind === "PATTERN_EXECUTION_PLAN" && !readyPatternProgress);
    const progress = compatiblePatternProgress || routeProgress(records);
    const safeReviewRecovery = activeTechnologyReviewReadyForRouting(progress);
    const unsafe = records.some((record) => isUnsafeProgress(record) && !(stalePatternPlan && record === compatiblePatternProgress)) && !safeReviewRecovery;
    const action = stalePatternPlan
      ? { label: "Открыть проект", href: projectRoute(ROUTES.PATTERN_EXECUTION_PLAN, id), canContinue: true }
      : actionFor(project, progress, unsafe);
    const updatedAt = validTimestamp(project.updated_at) !== null ? project.updated_at : null;
    const revision = Number.isSafeInteger(project.revision) && project.revision >= 0
      ? project.revision
      : 0;
    return {
      id,
      title: displayTitle(project),
      type: typeLabel(project),
      state: stalePatternPlan ? "План вязания устарел" : humanState(project, progress, unsafe),
      summary: text(project.workspace_continuation?.summary),
      updatedAt,
      action,
      completedTechnologyReview: completedTechnologyReviewAction(records, id),
      canContinue: Boolean(action?.canContinue),
      canFeature: project.workspace_continuation?.status === "pending",
      orderTime: validTimestamp(project.updated_at) ?? validTimestamp(project.created_at),
      revision,
      sourceIndex,
    };
  }

  function buildWorkspaceViewModel(projects = [], progressRecords = []) {
    const sourceProjects = Array.isArray(projects) ? projects : [];
    const sourceProgress = Array.isArray(progressRecords) ? progressRecords : [];
    const seen = new Set();
    const cards = [];
    sourceProjects.forEach((project, sourceIndex) => {
      if (!isRecord(project)) {
        return;
      }
      const id = projectIdOf(project);
      if (!id || seen.has(id) || project.workspace_status === "DELETED") {
        return;
      }
      seen.add(id);
      const records = sourceProgress.filter((record) =>
        isRecord(record) && progressProjectId(record) === id,
      );
      cards.push(buildProjectCard(project, records, sourceIndex));
    });
    cards.sort(compareRecency);
    const latestProject = cards.find((card) => card.canContinue) || cards.find((card) => card.canFeature) || null;
    const visibleProjects = cards.map(({ orderTime, revision, sourceIndex, canFeature, ...card }) => card);
    const visibleLatest = latestProject
      ? (({ orderTime, revision, sourceIndex, canFeature, ...card }) => card)(latestProject)
      : null;
    return {
      primaryAction: buildPrimaryActionModel(),
      projects: visibleProjects,
      latestProject: visibleLatest,
      latestPresentation: buildLatestProjectPresentation(visibleLatest),
      empty: cards.length === 0,
      emptyState: {
        title: "Здесь появятся твои проекты",
        description: "Начни с фотографии, схемы, PDF или обычного описания вещи.",
        actionId: CREATE_PROJECT_ACTION_ID,
        actionLabel: "Создать первый проект",
      },
    };
  }

  function normalizedIdentity(value) {
    return text(value)?.slice(0, 180) || "";
  }

  function projectIdentityFromLocation(locationLike, validateIdentity = () => true) {
    try {
      const url = new URL(locationLike?.href || String(locationLike), "http://localhost");
      const queryIdentity = normalizedIdentity(url.searchParams.get("project"));
      const hashText = url.hash.startsWith("#") ? url.hash.slice(1) : url.hash;
      const hashParameters = new URLSearchParams(hashText.includes("?") ? hashText.split("?").at(-1) : hashText);
      const hashIdentity = normalizedIdentity(hashParameters.get("project"));
      const identity = queryIdentity || hashIdentity;
      return identity && validateIdentity(identity) ? identity : "";
    } catch {
      return "";
    }
  }

  function projectRoute(pathname, projectId, hash = "") {
    const identity = normalizedIdentity(projectId);
    if (!identity || typeof pathname !== "string" || !pathname.startsWith("/") || pathname.startsWith("//")) {
      return "";
    }
    const parameters = new URLSearchParams({ project: identity });
    return `${pathname}?${parameters.toString()}${hash ? `#${hash.replace(/^#/, "")}` : ""}`;
  }

  function progressDestination(record, projectId) {
    const route = WORKSPACE_ACTION_ROUTES[String(record?.kind || "")];
    if (!route) return "";
    const destination = projectRoute(route, projectId);
    return record?.kind === "PATTERN_EXECUTION_SESSION" && record?.state?.virtualDryRun?.started === true ? `${destination}&mode=virtual_dry_run` : destination;
  }

  function unsafeInitialization(initialization) {
    const integrity = isRecord(initialization?.integrity) ? initialization.integrity : {};
    return Boolean(
      integrity.quarantined ||
      integrity.collision ||
      integrity.importedUnproven ||
      initialization?.quarantined ||
      initialization?.collided ||
      initialization?.imported_unproven,
    );
  }

  function latestWorkingProgress(records, projectId) {
    const candidates = (Array.isArray(records) ? records : [])
      .filter((entry) => isRecord(entry) && progressProjectId(entry) === projectId)
      .filter((entry) => progressDestination(entry, projectId) && !isUnsafeProgress(entry))
      .filter((entry) => entry.kind !== "PROJECT_EXECUTION_NEXT_STEP_CLARIFICATION")
      .map((entry, index) => ({
        entry,
        index,
        timestamp: validTimestamp(entry.updated_at) ?? validTimestamp(entry.created_at),
      }));
    candidates.sort((left, right) => {
      if (left.timestamp !== null && right.timestamp !== null && left.timestamp !== right.timestamp) {
        return right.timestamp - left.timestamp;
      }
      if (left.timestamp !== null) return -1;
      if (right.timestamp !== null) return 1;
      return right.index - left.index;
    });
    return candidates[0]?.entry || null;
  }

  function compatibleReadyPatternExecutionProgress(records, projectId) {
    const source = (Array.isArray(records) ? records : []).filter((entry) => isRecord(entry) && progressProjectId(entry) === projectId && !entry.deleted_at);
    const reviewRecord = latestProgress(source.filter((entry) => entry.kind === "PATTERN_TECHNOLOGY_REVIEW" && entry.state?.status === "confirmed"));
    const planRecord = latestProgress(source.filter(executionPlanReadyForRouting));
    if (!reviewRecord || !planRecord) return null;
    const review = reviewRecord.state;
    const plan = planRecord.state;
    const input = review.confirmedSnapshot?.executableTechnologyPlanInput;
    const repairAudit = (Array.isArray(review.audit) ? review.audit : []).findLast((entry) => entry?.type === "causal_trace_revalidated" && entry?.userConfirmationPreserved === true) || null;
    if (
      review.validation?.isValid !== true ||
      review.validation?.validatedRevision !== review.revision ||
      input?.algorithmId !== "stage20-v2-branch-resolved-adapted-execution:v6" ||
      input?.adaptedExecution?.causalTrace?.schemaId !== "AUTHORITATIVE_CAUSAL_TRACE_V1" ||
      plan.sourceTechnologyReviewId !== review.id ||
      plan.sourceStage20ResultIdentity !== input.binding?.stage20ResultIdentity ||
      plan.sourceStage20ProjectionFingerprint !== input.binding?.stage20SourceProjectionFingerprint ||
      plan.sourceInstructionEvidenceIdentity !== input.binding?.sourceInstructionEvidenceIdentity ||
      plan.sourceInstructionEvidenceRevision !== input.binding?.sourceInstructionEvidenceRevision ||
      plan.sourceInstructionEvidenceFingerprint !== input.binding?.sourceInstructionEvidenceFingerprint ||
      plan.sourceBranchFingerprint !== input.branchSelection?.fingerprint ||
      plan.sourceAdaptationProfileIdentity !== input.adaptedExecution?.adaptationProfile?.identity ||
      plan.sourceAdaptationProfileRevision !== input.adaptedExecution?.adaptationProfile?.revision ||
      plan.sourceAdaptationProfileFingerprint !== input.adaptedExecution?.adaptationProfile?.fingerprint ||
      plan.sourceSolverResultIdentity !== input.adaptedExecution?.solverIdentity ||
      plan.sourceSolverResultFingerprint !== input.adaptedExecution?.solverFingerprint ||
      plan.plan?.handoff?.executionGraphFingerprint !== plan.sourceExecutionGraphFingerprint ||
      plan.plan?.handoff?.operationCount !== plan.sourceAdaptedOperationCount ||
      plan.plan?.steps?.length !== input.adaptedExecution?.operations?.length ||
      plan.plan.steps.some((step, index) => step.sourceOperationIdentity !== input.adaptedExecution.operations[index]?.identity)
    ) return null;
    const exactBinding = plan.sourceTechnologyReviewRevision === review.revision && plan.sourceConfirmedSnapshotFingerprint === review.confirmedSnapshotFingerprint && plan.sourceExecutableInputIdentity === input.identity && plan.sourceExecutableInputFingerprint === input.fingerprint;
    const repairedBinding = repairAudit && repairAudit.previousConfirmedSnapshotFingerprint === plan.sourceConfirmedSnapshotFingerprint && repairAudit.previousExecutableInputFingerprint === plan.sourceExecutableInputFingerprint;
    if (!exactBinding && !repairedBinding) return null;
    const virtualSession = latestProgress(source.filter((entry) => entry.kind === "PATTERN_EXECUTION_SESSION" && entry.state?.virtualDryRun?.started === true && ["active", "completed"].includes(entry.state.virtualDryRun.status)));
    if (
      virtualSession?.state?.sourceExecutionPlanId === plan.id &&
      virtualSession.state.sourceExecutionPlanRevision === plan.revision &&
      virtualSession.state.sourceExecutionPlanFingerprint === plan.planFingerprint
    ) return virtualSession;
    return planRecord;
  }

  function compatiblePatternExecutionProgress(records, projectId) {
    const readyProgress = compatibleReadyPatternExecutionProgress(records, projectId);
    if (readyProgress) return readyProgress;
    const source = (Array.isArray(records) ? records : []).filter((entry) => isRecord(entry) && progressProjectId(entry) === projectId && !entry.deleted_at);
    const reviewRecord = latestProgress(source.filter((entry) => entry.kind === "PATTERN_TECHNOLOGY_REVIEW" && entry.state?.status === "confirmed"));
    const stalePlanRecord = latestProgress(source.filter(executionPlanAvailableForStaleRouting));
    if (
      reviewRecord &&
      stalePlanRecord &&
      completedTechnologyReviewReadyForViewing(reviewRecord) &&
      stalePlanRecord.state?.sourceTechnologyReviewId === reviewRecord.state?.id &&
      Number.isInteger(stalePlanRecord.state?.sourceTechnologyReviewRevision) &&
      stalePlanRecord.state.sourceTechnologyReviewRevision > 0 &&
      stalePlanRecord.state.sourceTechnologyReviewRevision <= reviewRecord.state.revision &&
      executionPlanStaleAgainstReview(stalePlanRecord, reviewRecord)
    ) return stalePlanRecord;
    return null;
  }

  function foundationMeasurementNextAction(records, projectId) {
    const measurementDomain = globalObject.YarnAIFoundationSectionMeasurement;
    const executionDomain = globalObject.YarnAIFoundationSectionExecution;
    if (!measurementDomain) return null;
    const measurements = (Array.isArray(records) ? records : []).filter((entry) => isRecord(entry) && progressProjectId(entry) === projectId && entry.kind === measurementDomain.KIND && !entry.deleted_at);
    if (!measurements.length) return null;
    const boundary = measurementDomain.resolveAuthoritativeHistory(measurements);
    const measurementDestination = projectRoute(measurementDomain.ROUTE_PATH, projectId);
    if (boundary.terminalReached) return actionModel("ready", "open-foundation-measurement", "Целевая высота резинки подтверждена", "Физическое измерение остаётся последней подтверждённой точкой проекта до появления следующего этапа.", measurementDestination);
    if (boundary.status !== "valid" || !boundary.authoritativeState) return actionModel("blocked", "review-foundation-measurement", "Историю измерений нужно проверить", boundary.diagnostic?.message || "Продолжение резинки заблокировано, потому что сохранённый результат не удалось подтвердить.", measurementDestination, [boundary.diagnostic?.code || "measurement-history-conflict"]);
    const measured = boundary.authoritativeState;
    if (["collecting", "reviewing"].includes(measured.lifecycle)) return actionModel("ready", "open-foundation-measurement", measured.lifecycle === "reviewing" ? "Сохраните измеренную высоту" : "Введите измеренную высоту", "Открытая проверка физического результата остаётся текущим шагом.", measurementDestination);
    const executionRecords = (Array.isArray(records) ? records : []).filter((entry) => isRecord(entry) && progressProjectId(entry) === projectId && entry.kind === executionDomain?.KIND && !entry.deleted_at);
    if (executionRecords.length !== 1 || !executionDomain) return actionModel("blocked", "review-foundation-measurement", "Продолжение резинки недоступно", "Не удалось безопасно подтвердить текущее выполнение после измерения.", measurementDestination, ["foundation-execution-conflict"]);
    let executionState;
    try { executionState = executionDomain.validateProgressState(executionRecords[0].state); }
    catch { return actionModel("blocked", "review-foundation-measurement", "Продолжение резинки недоступно", "Сохранённое выполнение резинки повреждено.", measurementDestination, ["foundation-execution-corrupted"]); }
    if (executionState.revision > measured.source.executionStateRevision && executionState.lifecycle === "paused") return actionModel("ready", "open-foundation-measurement", "Снова измерьте высоту резинки", "После реального продолжения и новой паузы доступна следующая попытка измерения.", measurementDestination);
    return actionModel("ready", "continue-foundation-execution", "Продолжить вязать резинку", "Последнее физическое измерение ниже цели. Сначала явно продолжите вязание, затем снова приостановите его перед новой проверкой.", projectRoute(executionDomain.ROUTE_PATH, projectId));
  }

  function primaryFabricPreparationNextAction(records, projectId) {
    const domain = globalObject.YarnAIPrimaryFabricPreparation;
    const measurementDomain = globalObject.YarnAIFoundationSectionMeasurement;
    if (!domain || !measurementDomain) return null;
    const source = Array.isArray(records) ? records : [];
    const measurements = source.filter((entry) => isRecord(entry) && progressProjectId(entry) === projectId && entry.kind === measurementDomain.KIND && !entry.deleted_at);
    const boundary = measurementDomain.resolveAuthoritativeHistory(measurements);
    const destination = projectRoute(domain.ROUTE_PATH, projectId);
    const preparations = source.filter((entry) => isRecord(entry) && progressProjectId(entry) === projectId && entry.kind === domain.KIND && !entry.deleted_at);
    if (preparations.length) {
      if (boundary.status !== "valid" || !boundary.terminalReached || preparations.length !== 1 || preparations[0].conflict_id || preparations[0].quarantined || preparations[0].validation_status === "IMPORTED_UNPROVEN" || preparations[0].imported_unproven) return actionModel("blocked", "review-primary-fabric-preparation", "Подготовку основного полотна нужно проверить", "Не удалось безопасно подтвердить сохранённую подготовку и физический результат резинки.", destination, [boundary.diagnostic?.code || "primary-fabric-preparation-conflict"]);
      try { domain.validateProgressState(preparations[0].state); }
      catch (problem) { return actionModel("blocked", "review-primary-fabric-preparation", "Подготовку основного полотна нужно проверить", problem?.userMessage || "Сохранённая подготовка повреждена.", destination, [problem?.code || "primary-fabric-preparation-corrupted"]); }
      return actionModel("ready", "open-primary-fabric-preparation", "Основное полотно подготовлено", "Узор, раппорт и целевая высота сохранены как неизменяемая подготовка следующего участка.", destination);
    }
    if (boundary.status === "valid" && boundary.terminalReached) return actionModel("ready", "prepare-primary-fabric", "Подготовить основное полотно", "Резинка физически достигла цели. В плане осталось указать узор, раппорт и высоту следующего участка.", destination);
    return null;
  }

  function primaryFabricExecutionNextAction(records, projectId) {
    const domain = globalObject.YarnAIPrimaryFabricExecution; const preparationDomain = globalObject.YarnAIPrimaryFabricPreparation;
    if (!domain || !preparationDomain) return null;
    const source = Array.isArray(records) ? records : []; const destination = projectRoute(domain.ROUTE_PATH, projectId);
    const executions = source.filter((entry) => isRecord(entry) && progressProjectId(entry) === projectId && entry.kind === domain.KIND && !entry.deleted_at);
    const preparations = source.filter((entry) => isRecord(entry) && progressProjectId(entry) === projectId && entry.kind === preparationDomain.KIND && !entry.deleted_at);
    if (executions.length) {
      if (executions.length !== 1 || preparations.length !== 1 || executions.some(isUnsafeProgress) || preparations.some(isUnsafeProgress)) return actionModel("blocked", "review-primary-fabric-execution", "Выполнение основного полотна нужно проверить", "Сохранённое выполнение или его подготовка конфликтуют.", destination, ["primary-fabric-execution-conflict"]);
      try { const execution = domain.validateProgressState(executions[0].state); const preparation = preparationDomain.validateProgressState(preparations[0].state); if (execution.source.stage73StateIdentity !== preparation.identity || execution.source.stage73StateFingerprint !== preparation.fingerprint || execution.source.stage73ProgressIdentity !== preparations[0].progress_id || execution.source.stage73ProgressRevision !== preparations[0].revision) throw new Error("source-binding-mismatch"); return actionModel("ready", "open-primary-fabric-execution", execution.lifecycle === "ready" ? "Начать основное полотно" : "Вернуться к основному полотну", execution.lifecycle === "paused" ? "Работа приостановлена и готова к явному продолжению." : execution.lifecycle === "active" ? "Основное полотно находится в работе." : "Подтверждённый план готов к физическому выполнению.", destination); }
      catch (problem) { return actionModel("blocked", "review-primary-fabric-execution", "Выполнение основного полотна нужно проверить", problem?.userMessage || "Сохранённое выполнение повреждено.", destination, [problem?.code || "primary-fabric-execution-corrupted"]); }
    }
    if (preparations.length === 1 && !isUnsafeProgress(preparations[0])) { try { preparationDomain.validateProgressState(preparations[0].state); return actionModel("ready", "start-primary-fabric-execution", "Связать основное полотно", "Подготовка завершена. Можно начать физическое выполнение сохранённого плана.", destination); } catch { return actionModel("blocked", "review-primary-fabric-execution", "Выполнение основного полотна нужно проверить", "Подтверждённая подготовка повреждена.", destination, ["primary-fabric-preparation-corrupted"]); } }
    return null;
  }

  function primaryFabricMeasurementNextAction(records, projectId) {
    const domain = globalObject.YarnAIPrimaryFabricMeasurement; const executionDomain = globalObject.YarnAIPrimaryFabricExecution;
    if (!domain || !executionDomain) return null;
    const source = Array.isArray(records) ? records : []; const destination = projectRoute(domain.ROUTE_PATH, projectId); const executionDestination = projectRoute(executionDomain.ROUTE_PATH, projectId);
    const measurements = source.filter((entry) => isRecord(entry) && progressProjectId(entry) === projectId && entry.kind === domain.KIND && !entry.deleted_at);
    if (!measurements.length) return null;
    const boundary = domain.resolveAuthoritativeHistory(measurements);
    if (boundary.status !== "valid") return actionModel("blocked", "review-primary-fabric-measurement", "Измерение основного полотна нужно проверить", boundary.diagnostic?.message || "История физических измерений конфликтует.", destination, [boundary.diagnostic?.code || "primary-fabric-measurement-conflict"]);
    const state = boundary.authoritativeState;
    if (!state) return actionModel("blocked", "review-primary-fabric-measurement", "Измерение основного полотна нужно проверить", "Не удалось определить authoritative результат.", destination, ["primary-fabric-measurement-missing"]);
    if (state.lifecycle === "collecting") return actionModel("ready", "open-primary-fabric-measurement", "Измерить основное полотно", "Введите физически измеренную текущую высоту.", destination);
    if (state.completedSnapshot?.result === "BELOW_TARGET") return actionModel("ready", "continue-primary-fabric", "Продолжить основное полотно", "Сохранённое измерение ниже цели. Продолжите вязать и снова приостановите работу перед следующей проверкой.", executionDestination);
    if (state.completedSnapshot?.result === "TARGET_REACHED") return actionModel("ready", "plan-next-section", "Основное полотно готово. Подготовим следующий этап изделия.", "Текущий immutable-план исчерпан. Продолжение начинается с планирования конструкции, а не с выполнения.", projectRoute("/project-next-section-planning", projectId));
    return actionModel("blocked", "review-primary-fabric-measurement", "Измерение основного полотна нужно проверить", "Сохранённый результат повреждён.", destination, ["primary-fabric-measurement-corrupted"]);
  }

  function nextSectionPlanningNextAction(records, projectId) {
    const domain = globalObject.YarnAIProjectNextSectionPlanning;
    if (!domain) return null;
    const destination = projectRoute(domain.ROUTE_PATH, projectId); const constructionDestination = projectRoute("/project-construction-strategy-planning", projectId);
    const selected = (Array.isArray(records) ? records : []).filter((entry) => isRecord(entry) && progressProjectId(entry) === projectId && entry.kind === domain.KIND && !entry.deleted_at);
    if (!selected.length) return null;
    if (selected.length !== 1 || selected.some(isUnsafeProgress)) return actionModel("blocked", "review-next-section-planning", "Планирование следующего участка нужно проверить", "Сохранённые версии конфликтуют.", destination, ["next-section-planning-conflict"]);
    try {
      const state = domain.validateProgressState(selected[0].state, { projectIdentity: projectId, calculationId: selected[0].calculation_id });
      return actionModel("ready", "choose-construction-strategy", "Направление конструкции подтверждено", "Следующее отдельное решение — как формируются корпус, рукава и верх изделия.", constructionDestination);
    } catch (problem) {
      return actionModel("blocked", "review-next-section-planning", "Планирование следующего участка нужно проверить", problem?.userMessage || "Immutable snapshot повреждён.", destination, [problem?.code || "next-section-planning-corrupted"]);
    }
  }

  function constructionStrategyPlanningNextAction(records, projectId) {
    const domain = globalObject.YarnAIProjectConstructionStrategyPlanning; if (!domain) return null;
    const destination = projectRoute(domain.ROUTE_PATH, projectId); const selected = (Array.isArray(records) ? records : []).filter((entry) => isRecord(entry) && progressProjectId(entry) === projectId && entry.kind === domain.KIND && !entry.deleted_at);
    if (!selected.length) return null;
    if (selected.length !== 1 || selected.some(isUnsafeProgress)) return actionModel("blocked", "review-construction-strategy", "Стратегию конструкции нужно проверить", "Сохранённые версии конфликтуют.", destination, ["construction-strategy-conflict"]);
    try { const state = domain.validateProgressState(selected[0].state, { projectIdentity: projectId, calculationId: selected[0].calculation_id }); const shapingDestination = state.snapshot.clarification.strategyIdentity === "construction-strategy:body-sleeves-joined-raglan:v1" ? projectRoute("/project-shaping-policy-planning", projectId) : destination; return actionModel("ready", "choose-shaping-policy", "Конструкция верха подтверждена", "Следующее отдельное решение — как распределять формирование реглана. Новый план ещё не создан.", shapingDestination); }
    catch (problem) { return actionModel("blocked", "review-construction-strategy", "Стратегию конструкции нужно проверить", problem?.userMessage || "Immutable snapshot повреждён.", destination, [problem?.code || "construction-strategy-corrupted"]); }
  }

  function sleeveTargetGeometryPlanningNextAction(records, projectId) {
    const domain = globalObject.YarnAIProjectSleeveTargetGeometryPlanning;
    const destination = projectRoute("/project-sleeve-geometry-planning", projectId);
    const source = Array.isArray(records) ? records : [];
    const executionDestination = projectRoute("/project-sleeve-physical-execution", projectId); const executionDomain = globalObject.YarnAIProjectSleevePhysicalExecution;
    const execution = source.filter((entry) => isRecord(entry) && progressProjectId(entry) === projectId && entry.kind === "PROJECT_SLEEVE_PHYSICAL_EXECUTION" && !entry.deleted_at).sort((left, right) => left.epoch - right.epoch);
    if (execution.length) {
      if (!executionDomain || execution.some(isUnsafeProgress)) return actionModel("blocked", "review-sleeve-physical-execution", "Выполнение рукавов нужно проверить", "Сохранённая физическая история небезопасна или validator недоступен.", null, ["stage80-history-unsafe"]);
      try {
        let previous = null;
        for (let index = 0; index < execution.length; index += 1) { const record = execution[index]; const state = executionDomain.validateState(record.state); if (record.epoch !== index + 1 || state.preparationEpoch !== record.epoch || previous && state.predecessorPreparationIdentity !== previous.preparation.identity) throw new Error("stage80-history-conflict"); previous = state; }
        const projection = executionDomain.projectView(previous); return actionModel("ready", projection.lifecycle === "awaiting_pair_validation" ? "stage80-awaiting-pair-validation" : "continue-sleeve-physical-execution", projection.lifecycle === "awaiting_pair_validation" ? "Оба рукава физически завершены" : "Продолжить вязание рукавов", projection.lifecycle === "awaiting_pair_validation" ? "Фактические результаты сохранены; отдельная проверка пары ещё не выполнялась." : "Вернитесь к допустимым действиям каждого рукава.", executionDestination);
      } catch (problem) { return actionModel("blocked", "review-sleeve-physical-execution", "Выполнение рукавов нужно проверить", problem?.userMessage || "История Stage 80 повреждена.", null, [problem?.code || "stage80-history-conflict"]); }
    }
    const selected = source.filter((entry) => isRecord(entry) && progressProjectId(entry) === projectId && entry.kind === "PROJECT_SLEEVE_TARGET_GEOMETRY_PLANNING" && !entry.deleted_at).sort((left, right) => left.epoch - right.epoch);
    if (selected.length) {
      if (!domain || selected.some(isUnsafeProgress)) return actionModel("blocked", "review-sleeve-target-geometry", "План геометрии рукава нужно проверить", "Сохранённая история этапа небезопасна или проверка недоступна.", null, ["stage79-history-unsafe"]);
      try {
        let previous = null;
        for (let index = 0; index < selected.length; index += 1) {
          const record = selected[index]; const state = domain.validateState(record.state);
          if (record.epoch !== index + 1 || record.revision !== state.revision || state.epoch !== record.epoch || index < selected.length - 1 && state.lifecycle !== "completed" || previous && state.predecessorIdentity !== previous.identity) throw new Error("stage79-history-conflict");
          previous = state;
        }
        if (previous.lifecycle === "completed") return actionModel("ready", "start-sleeve-physical-execution", "План геометрии рукава подтверждён", "Начните физическое выполнение первого рукава без повторного ввода плановых данных.", executionDestination);
        return actionModel("ready", "continue-sleeve-target-geometry", "Продолжить планирование геометрии рукава", "Вернитесь к следующему незавершённому вопросу или проверке расчёта.", destination);
      } catch (problem) { return actionModel("blocked", "review-sleeve-target-geometry", "План геометрии рукава нужно проверить", problem?.userMessage || "История Stage 79 повреждена.", null, [problem?.code || "stage79-history-conflict"]); }
    }
    const stage78 = source.filter((entry) => isRecord(entry) && progressProjectId(entry) === projectId && entry.kind === "PROJECT_SHAPING_POLICY_PLANNING" && !entry.deleted_at);
    if (!stage78.length) return null;
    if (stage78.length !== 1 || stage78.some(isUnsafeProgress) || !globalObject.YarnAIProjectShapingPolicyPlanning) return actionModel("blocked", "review-sleeve-target-geometry-source", "Переход к геометрии рукава недоступен", "Stage 78 не удалось безопасно подтвердить.", null, ["stage78-source-conflict"]);
    try { globalObject.YarnAIProjectShapingPolicyPlanning.validateProgressState(stage78[0].state, { projectIdentity: projectId, calculationId: stage78[0].calculation_id }); return actionModel("ready", "start-sleeve-target-geometry", "Подготовить цели геометрии рукава", "Задайте готовые размеры рукава, затем проверьте рассчитанные петли и прибавки.", destination); }
    catch (problem) { return actionModel("blocked", "review-sleeve-target-geometry-source", "Переход к геометрии рукава недоступен", problem?.userMessage || "Stage 78 повреждён.", null, [problem?.code || "stage78-corrupted"]); }
  }

  function shapingPolicyPlanningNextAction(records, projectId) {
    const domain = globalObject.YarnAIProjectShapingPolicyPlanning; if (!domain) return null;
    const destination = projectRoute(domain.ROUTE_PATH, projectId); const selected = (Array.isArray(records) ? records : []).filter((entry) => isRecord(entry) && progressProjectId(entry) === projectId && entry.kind === domain.KIND && !entry.deleted_at);
    if (!selected.length) return null;
    if (selected.length !== 1 || selected.some(isUnsafeProgress)) return actionModel("blocked", "review-shaping-policy", "Способ формирования нужно проверить", "Сохранённые версии конфликтуют.", destination, ["shaping-policy-conflict"]);
    try { domain.validateProgressState(selected[0].state, { projectIdentity: projectId, calculationId: selected[0].calculation_id }); return actionModel("ready", "open-shaping-policy", "Формирование реглана подтверждено", "Решение сохранено. Следующим отдельным уточнением будет способ соединения; новый план ещё не создан.", destination); }
    catch (problem) { return actionModel("blocked", "review-shaping-policy", "Способ формирования нужно проверить", problem?.userMessage || "Immutable snapshot повреждён.", destination, [problem?.code || "shaping-policy-corrupted"]); }
  }

  function bodySleevesJoinExecutionNextAction(records, projectId) {
    const source = Array.isArray(records) ? records : []; const edgeEvidenceDomain = globalObject.YarnAIProjectRealizedFinishableEdgeEvidence; const necklineExecutionDomain = globalObject.YarnAIProjectNecklineOpeningExecution; const necklineDomain = globalObject.YarnAIProjectNecklineOpeningPlanning; const executionDomain = globalObject.YarnAIProjectRaglanShapingExecution; const scheduleDomain = globalObject.YarnAIProjectRaglanShapingSchedulePlanning; const yokeDomain = globalObject.YarnAIProjectYokeTargetGeometryPlanning; const joinDomain = globalObject.YarnAIProjectBodySleevesJoinExecution; const raglanDomain = globalObject.YarnAIProjectRaglanInterfacePlanning; const allocationDomain = globalObject.YarnAIProjectUnderarmAllocationExecution; const edgeEvidenceDestination = projectRoute("/project-realized-finishable-edge-evidence", projectId); const necklineExecutionDestination = projectRoute("/project-neckline-opening-execution", projectId); const necklineDestination = projectRoute("/project-neckline-opening-planning", projectId); const executionDestination = projectRoute("/project-raglan-shaping-execution", projectId); const scheduleDestination = projectRoute("/project-raglan-shaping-schedule-planning", projectId); const yokeDestination = projectRoute("/project-yoke-target-geometry-planning", projectId); const joinDestination = projectRoute("/project-body-sleeves-join-execution", projectId); const raglanDestination = projectRoute("/project-raglan-interface-planning", projectId);
    const edgeEvidenceRecords = source.filter((entry) => isRecord(entry) && progressProjectId(entry) === projectId && entry.kind === "PROJECT_REALIZED_FINISHABLE_EDGE_EVIDENCE" && !entry.deleted_at).sort((left, right) => left.epoch - right.epoch);
    if (edgeEvidenceRecords.length) {
      if (!edgeEvidenceDomain || edgeEvidenceRecords.some(isUnsafeProgress)) return actionModel("blocked", "review-realized-edge-evidence", "Physical edge evidence needs review", "The saved evidence record is unsafe or its validator is unavailable.", edgeEvidenceDestination, ["edge-evidence-history-unsafe"]);
      try { if (edgeEvidenceRecords.length !== 1) throw new Error("edge-evidence-history-conflict"); const state = edgeEvidenceDomain.validateState(edgeEvidenceRecords[0].state); const projection = edgeEvidenceDomain.projectView(state); return actionModel("ready", projection.lifecycle === "completed" ? "open-completed-realized-edge-evidence" : "continue-realized-edge-evidence", projection.lifecycle === "completed" ? "Physical finishing-edge topology is confirmed" : "Continue physical edge inventory", projection.lifecycle === "completed" ? "The immutable evidence is ready; future Stage 93 is not implemented." : "Complete exact ordering, ownership, coverage, anchors, and corners.", edgeEvidenceDestination); }
      catch (problem) { return actionModel("blocked", "review-realized-edge-evidence", "Physical edge evidence needs review", problem?.userMessage || "The evidence history is corrupted.", edgeEvidenceDestination, [problem?.code || "edge-evidence-history-conflict"]); }
    }
    const necklineExecutions = source.filter((entry) => isRecord(entry) && progressProjectId(entry) === projectId && entry.kind === "PROJECT_NECKLINE_OPENING_EXECUTION" && !entry.deleted_at).sort((left, right) => left.epoch - right.epoch);
    if (necklineExecutions.length) {
      if (!necklineExecutionDomain || necklineExecutions.some(isUnsafeProgress)) return actionModel("blocked", "review-neckline-opening-execution", "Физическое выполнение горловины нужно проверить", "Сохранённая история Stage 92 небезопасна или validator недоступен.", necklineExecutionDestination, ["stage92-history-unsafe"]);
      try { let previous = null; for (let index = 0; index < necklineExecutions.length; index += 1) { const item = necklineExecutions[index]; const state = necklineExecutionDomain.validateState(item.state); if (item.epoch !== index + 1 || state.predecessorIdentity !== (previous?.identity || null)) throw new Error("stage92-history-conflict"); previous = state; } const projection = necklineExecutionDomain.projectView(previous, { reloaded: true }); return actionModel("ready", projection.lifecycle === "completed" ? "start-realized-edge-evidence" : "continue-neckline-opening-execution", projection.lifecycle === "completed" ? "Горловина физически выполнена" : `Продолжить горловину: ${projection.progress.completedSteps} из ${projection.progress.totalSteps}`, projection.lifecycle === "completed" ? "До планирования отделки подтвердите отдельный дискретный инвентарь реально образовавшихся физических кромок." : projection.lifecycle === "paused" ? "Возобновите с последней подтверждённой физической границы; неподтверждённый шаг не считается выполненным." : "Продолжите ровно с сохранённого следующего шага V3.", projection.lifecycle === "completed" ? edgeEvidenceDestination : necklineExecutionDestination); }
      catch (problem) { return actionModel("blocked", "review-neckline-opening-execution", "Физическое выполнение горловины нужно проверить", problem?.userMessage || "История Stage 92 повреждена.", necklineExecutionDestination, [problem?.code || "stage92-history-conflict"]); }
    }
    const necklinePlans = source.filter((entry) => isRecord(entry) && progressProjectId(entry) === projectId && entry.kind === "PROJECT_NECKLINE_OPENING_PLANNING" && !entry.deleted_at).sort((left, right) => left.epoch - right.epoch);
    if (necklinePlans.length) {
      if (!necklineDomain || necklinePlans.some(isUnsafeProgress)) return actionModel("blocked", "review-neckline-opening-plan", "План горловины нужно проверить", "Сохранённая история Stage 91 небезопасна или проверка недоступна.", necklineDestination, ["stage91-history-unsafe"]);
      try { let previous = null; for (let index = 0; index < necklinePlans.length; index += 1) { const item = necklinePlans[index]; const state = necklineDomain.validateState(item.state); if (item.epoch !== index + 1 || state.predecessorIdentity !== (previous?.identity || null)) throw new Error("stage91-history-conflict"); previous = state; } const projection = necklineDomain.projectView(previous); if (/^v[12]_execution_ineligible$/.test(projection.lifecycle)) return actionModel("ready", "replan-neckline-opening-v3", "Нужен единый физический план V3", `Исторический план V${projection.contractVersion} доступен для чтения, но не может открыть физическое выполнение. Создайте и подтвердите V3.`, necklineDestination, ["stage91-v3-required"]); const eligible = projection.executionEligibility?.eligible === true; return actionModel("ready", eligible ? "start-neckline-opening-execution" : "continue-neckline-opening-plan", eligible ? "Единый физический план горловины V3 готов" : "Продолжить планирование горловины V3", eligible ? "Начните буквальное физическое выполнение с проверки исходной границы." : "Вернитесь к недостающему решению или единому потоку физических шагов.", eligible ? necklineExecutionDestination : necklineDestination); }
      catch (problem) { return actionModel("blocked", "review-neckline-opening-plan", "План горловины нужно проверить", problem?.userMessage || "История Stage 91 повреждена.", necklineDestination, [problem?.code || "stage91-history-conflict"]); }
    }
    const executions = source.filter((entry) => isRecord(entry) && progressProjectId(entry) === projectId && entry.kind === "PROJECT_RAGLAN_SHAPING_EXECUTION" && !entry.deleted_at).sort((left, right) => left.epoch - right.epoch);
    if (executions.length) {
      if (!executionDomain || executions.some(isUnsafeProgress)) return actionModel("blocked", "review-raglan-shaping-execution", "Физическое выполнение реглана нужно проверить", "Сохранённая история Stage 90 небезопасна или validator недоступен.", executionDestination, ["stage90-history-unsafe"]);
      try { let previous = null; for (let index = 0; index < executions.length; index += 1) { const item = executions[index]; const state = executionDomain.validateState(item.state); if (item.epoch !== index + 1 || state.predecessorIdentity !== (previous?.identity || null)) throw new Error("stage90-history-conflict"); previous = state; } const projection = executionDomain.projectView(previous, { reloaded: true }); return projection.lifecycle === "completed" ? actionModel("ready", "start-neckline-opening-plan", "Реглан физически выполнен", "Создайте точный план горловины, открытия и перехода от круга к поворотным рядам.", necklineDestination) : actionModel("ready", "continue-raglan-shaping-execution", projection.currentRound ? `Продолжить круг кокетки ${projection.currentRound.roundNumber}` : "Продолжить финальную проверку реглана", projection.currentRound?.workStatus === "awaiting_reconciliation" ? "Круг был начат, но не подтверждён. Вернитесь к безопасному согласованию физического положения." : "Продолжите ровно с сохранённого физического места.", executionDestination); }
      catch (problem) { return actionModel("blocked", "review-raglan-shaping-execution", "Физическое выполнение реглана нужно проверить", problem?.userMessage || "История Stage 90 повреждена.", executionDestination, [problem?.code || "stage90-history-conflict"]); }
    }
    const schedules = source.filter((entry) => isRecord(entry) && progressProjectId(entry) === projectId && entry.kind === "PROJECT_RAGLAN_SHAPING_SCHEDULE_PLANNING" && !entry.deleted_at).sort((left, right) => left.epoch - right.epoch);
    if (schedules.length) {
      if (!scheduleDomain || schedules.some(isUnsafeProgress)) return actionModel("blocked", "review-raglan-shaping-schedule", "План рядов реглана нужно проверить", "Сохранённая история Stage 89 небезопасна или validator недоступен.", scheduleDestination, ["stage89-history-unsafe"]);
      try { let previous = null; for (let index = 0; index < schedules.length; index += 1) { const item = schedules[index]; const state = scheduleDomain.validateState(item.state); if (item.epoch !== index + 1 || state.predecessorIdentity !== (previous?.identity || null)) throw new Error("stage89-history-conflict"); previous = state; } const projection = scheduleDomain.projectView(previous); return projection.lifecycle === "completed" ? actionModel("ready", "start-raglan-shaping-execution", "План рядов реглана готов", "Начните физическое выполнение с проверки исходных петель и круга 2.", executionDestination) : actionModel("ready", "continue-raglan-shaping-schedule", "Продолжить планирование рядов реглана", "Вернитесь к подтверждению допустимых фаз или проверке расписания.", scheduleDestination); }
      catch (problem) { return actionModel("blocked", "review-raglan-shaping-schedule", "План рядов реглана нужно проверить", problem?.userMessage || "История Stage 89 повреждена.", scheduleDestination, [problem?.code || "stage89-history-conflict"]); }
    }
    const yokePlans = source.filter((entry) => isRecord(entry) && progressProjectId(entry) === projectId && entry.kind === "PROJECT_YOKE_TARGET_GEOMETRY_PLANNING" && !entry.deleted_at).sort((left, right) => left.epoch - right.epoch);
    if (yokePlans.length) {
      if (!yokeDomain || yokePlans.some(isUnsafeProgress)) return actionModel("blocked", "review-yoke-target-geometry", "Геометрию кокетки нужно проверить", "Сохранённая история Stage 88 небезопасна или validator недоступен.", yokeDestination, ["stage88-history-unsafe"]);
      try { let previous = null; for (let index = 0; index < yokePlans.length; index += 1) { const item = yokePlans[index]; const state = yokeDomain.validateState(item.state); if (item.epoch !== index + 1 || state.predecessorIdentity !== (previous?.identity || null)) throw new Error("stage88-history-conflict"); previous = state; } const projection = yokeDomain.projectView(previous); return projection.lifecycle === "completed" ? actionModel("ready", "start-raglan-shaping-schedule", "Целевая геометрия кокетки готова", "Подтвердите допустимые фазы узора и постройте точный план кругов убавлений.", scheduleDestination) : actionModel("ready", "continue-yoke-target-geometry", "Продолжить расчёт кокетки", "Вернитесь к следующему незавершённому размеру, варианту или проверке.", yokeDestination); }
      catch (problem) { return actionModel("blocked", "review-yoke-target-geometry", "Геометрию кокетки нужно проверить", problem?.userMessage || "История Stage 88 повреждена.", yokeDestination, [problem?.code || "stage88-history-conflict"]); }
    }
    const joins = source.filter((entry) => isRecord(entry) && progressProjectId(entry) === projectId && entry.kind === "PROJECT_BODY_SLEEVES_JOIN_EXECUTION" && !entry.deleted_at).sort((left, right) => left.epoch - right.epoch);
    if (joins.length) {
      if (!joinDomain || joins.some(isUnsafeProgress)) return actionModel("blocked", "review-body-sleeves-join", "Соединение корпуса и рукавов нужно проверить", "Сохранённая физическая история небезопасна или validator недоступен.", joinDestination, ["stage87-history-unsafe"]);
      try { let previous = null; for (let index = 0; index < joins.length; index += 1) { const item = joins[index]; const state = joinDomain.validateState(item.state); if (item.epoch !== index + 1 || state.predecessorIdentity !== (previous?.identity || null)) throw new Error("stage87-history-conflict"); previous = state; } const projection = joinDomain.projectView(previous); return actionModel("ready", projection.lifecycle === "completed" ? "start-yoke-target-geometry" : "continue-body-sleeves-join", projection.lifecycle === "completed" ? "Корпус и рукава соединены" : "Продолжить соединение корпуса и рукавов", projection.lifecycle === "completed" ? "Определите высоту и количество петель верхнего края кокетки до планирования рядов убавок." : "Продолжите с первого неподтверждённого физического действия.", projection.lifecycle === "completed" ? yokeDestination : joinDestination); }
      catch (problem) { return actionModel("blocked", "review-body-sleeves-join", "Соединение корпуса и рукавов нужно проверить", problem?.userMessage || "История Stage 87 повреждена.", joinDestination, [problem?.code || "stage87-history-conflict"]); }
    }
    const raglan = source.filter((entry) => isRecord(entry) && progressProjectId(entry) === projectId && entry.kind === "PROJECT_RAGLAN_INTERFACE_PLANNING" && !entry.deleted_at).sort((left, right) => left.epoch - right.epoch);
    if (raglan.length) {
      if (!raglanDomain || raglan.some(isUnsafeProgress)) return actionModel("blocked", "review-raglan-interface-plan", "План линий реглана нужно проверить", "Сохранённая история Stage 86 небезопасна.", raglanDestination, ["stage86-history-unsafe"]);
      try { let previous = null; for (let index = 0; index < raglan.length; index += 1) { const item = raglan[index]; const state = raglanDomain.validateState(item.state); if (item.epoch !== index + 1 || state.predecessorIdentity !== (previous?.identity || null)) throw new Error("stage86-history-conflict"); previous = state; } return previous.lifecycle === "completed" ? actionModel("ready", "start-body-sleeves-join", "План линий реглана готов", "Начните физическое соединение с обязательной проверки готовности.", joinDestination) : actionModel("ready", "continue-raglan-interface-plan", "Продолжить планирование линий реглана", "Вернитесь к незавершённому выбору или проверке плана.", raglanDestination); }
      catch (problem) { return actionModel("blocked", "review-raglan-interface-plan", "План линий реглана нужно проверить", problem?.userMessage || "История Stage 86 повреждена.", raglanDestination, [problem?.code || "stage86-history-conflict"]); }
    }
    const allocation = source.filter((entry) => isRecord(entry) && progressProjectId(entry) === projectId && entry.kind === "PROJECT_UNDERARM_ALLOCATION_EXECUTION" && !entry.deleted_at).sort((left, right) => left.epoch - right.epoch);
    if (!allocation.length) return null;
    if (!allocationDomain || allocation.some(isUnsafeProgress)) return actionModel("blocked", "review-underarm-allocation", "Распределение подрезов нужно проверить", "Сохранённая история Stage 85 небезопасна.", null, ["stage85-history-unsafe"]);
    try { const state = allocationDomain.validateState(allocation.at(-1).state); if (state.lifecycle === "completed") return actionModel("ready", "start-raglan-interface-plan", "Распределение подрезов подтверждено", "Выберите и зафиксируйте четыре линии реглана перед физическим соединением.", raglanDestination); }
    catch (problem) { return actionModel("blocked", "review-underarm-allocation", "Распределение подрезов нужно проверить", problem?.userMessage || "История Stage 85 повреждена.", null, [problem?.code || "stage85-history-conflict"]); }
    return null;
  }

  function actionModel(status, action, title, description, destination, reasons = [], warnings = []) {
    return Object.freeze({
      status,
      action,
      title,
      description,
      destination,
      reasons: Object.freeze([...reasons]),
      warnings: Object.freeze([...warnings]),
    });
  }

  function determineNextAction(input = {}) {
    const projectId = normalizedIdentity(input.projectId);
    const assessment = isRecord(input.initializationAssessment) ? input.initializationAssessment : {};
    const initialization = assessment.existing || input.initialization || null;
    const reviewDestination = projectRoute("/user-workspace-entry", projectId, "project-details");
    if (!projectId || !reviewDestination) {
      return actionModel("blocked", "review-details", "Проект не удалось открыть", "Вернитесь в мастерскую и выберите проект заново.", "", ["project-identity-invalid"]);
    }
    const readyPatternProgress = compatibleReadyPatternExecutionProgress(input.progressRecords, projectId);
    const compatiblePatternProgress = readyPatternProgress || compatiblePatternExecutionProgress(input.progressRecords, projectId);
    if (compatiblePatternProgress) {
      const stalePlan = Boolean(compatiblePatternProgress.kind === "PATTERN_EXECUTION_PLAN" && !readyPatternProgress);
      return actionModel(
        stalePlan ? "stale" : "ready",
        "continue-pattern-execution",
        stalePlan ? "Сохранённый план устарел" : "Сохранённый план готов",
        stalePlan ? "Stage 22 сохранён для проверки. Он откроется в stale-режиме и не будет перестроен без явного действия пользователя." : "YarnAI проверил сохранённые Stage 21 и Stage 22. Можно продолжить с прежнего безопасного состояния.",
        progressDestination(compatiblePatternProgress, projectId),
        stalePlan ? ["pattern-execution-plan-stale"] : [],
      );
    }
    const activeTechnologyReview = latestProgress((Array.isArray(input.progressRecords) ? input.progressRecords : [])
      .filter((record) => progressProjectId(record) === projectId && activeTechnologyReviewReadyForRouting(record)));
    if (activeTechnologyReview) {
      return actionModel(
        "ready",
        "continue-pattern-technology-review",
        "Проверка обновлённого плана не завершена",
        "Вернитесь к обязательному решению по исполнимому технологическому плану. YarnAI не примет его за вас.",
        projectRoute(ROUTES.PATTERN_TECHNOLOGY_REVIEW, projectId),
      );
    }
    if (assessment.verdict === "stale" || assessment.current === false && initialization) {
      return actionModel("stale", "review-details", "Сведения изменились — проверьте их ещё раз", "Перед продолжением нужно подтвердить актуальные параметры изделия.", reviewDestination, assessment.reasons || ["initialization-stale"]);
    }
    if (
      assessment.verdict !== "ready" ||
      assessment.current !== true ||
      assessment.canContinue !== true ||
      initialization?.lifecycle !== "initialized" ||
      unsafeInitialization(initialization)
    ) {
      return actionModel("blocked", "review-details", "Сначала подтвердите сведения о проекте", "Работа начнётся после безопасной проверки размера и параметров изделия.", reviewDestination, assessment.reasons || ["initialization-blocked"]);
    }
    if (input.materialState === "broken") {
      return actionModel("blocked", "repair-materials", "Проверьте исходные материалы", "Один из файлов недоступен. Добавьте его заново, чтобы продолжить.", projectRoute("/user-workspace-entry", projectId, "workspace-materials"), ["material-reference-broken"]);
    }
    const bodySleevesJoinAction = bodySleevesJoinExecutionNextAction(input.progressRecords, projectId);
    if (bodySleevesJoinAction) return bodySleevesJoinAction;
    const sleeveTargetGeometryAction = sleeveTargetGeometryPlanningNextAction(input.progressRecords, projectId);
    if (sleeveTargetGeometryAction) return sleeveTargetGeometryAction;
    const shapingPolicyAction = shapingPolicyPlanningNextAction(input.progressRecords, projectId);
    if (shapingPolicyAction) return shapingPolicyAction;
    const constructionStrategyAction = constructionStrategyPlanningNextAction(input.progressRecords, projectId);
    if (constructionStrategyAction) return constructionStrategyAction;
    const nextSectionPlanningAction = nextSectionPlanningNextAction(input.progressRecords, projectId);
    if (nextSectionPlanningAction) return nextSectionPlanningAction;
    const primaryFabricMeasurementAction = primaryFabricMeasurementNextAction(input.progressRecords, projectId);
    if (primaryFabricMeasurementAction) return primaryFabricMeasurementAction;
    const primaryFabricExecutionAction = primaryFabricExecutionNextAction(input.progressRecords, projectId);
    if (primaryFabricExecutionAction) return primaryFabricExecutionAction;
    const primaryFabricAction = primaryFabricPreparationNextAction(input.progressRecords, projectId);
    if (primaryFabricAction) return primaryFabricAction;
    const foundationAction = foundationMeasurementNextAction(input.progressRecords, projectId);
    if (foundationAction) return foundationAction;
    const continuation = isRecord(input.continuationProjection) ? input.continuationProjection : null;
    if (continuation?.status === "pending") {
      return actionModel("pending", "next-step-prepared", continuation.title, continuation.summary, null);
    }
    if (continuation?.status === "ready") {
      return actionModel("ready", "clarify-next-step", continuation.title, continuation.summary, continuation.destination);
    }
    if (continuation?.status === "blocked") {
      return actionModel("blocked", "review-continuation", continuation.title, continuation.summary, "/saved-projects", [continuation.diagnostic?.code || "continuation-blocked"]);
    }
    const unprojectedClarification = (Array.isArray(input.progressRecords) ? input.progressRecords : [])
      .some((entry) => entry?.kind === "PROJECT_EXECUTION_NEXT_STEP_CLARIFICATION" && progressProjectId(entry) === projectId);
    if (unprojectedClarification) {
      return actionModel("blocked", "review-continuation", "Подтверждённый шаг нужно проверить", "Не удалось безопасно проверить сохранённый результат.", "/saved-projects", ["continuation-unavailable"]);
    }
    if (input.calculationState?.current === true) {
      if (input.planState?.completed && input.planState.current) return actionModel("ready", "open-plan", "\u041f\u043b\u0430\u043d \u043f\u043e\u0434\u0442\u0432\u0435\u0440\u0436\u0434\u0451\u043d", "\u0421\u043e\u0445\u0440\u0430\u043d\u0451\u043d\u043d\u044b\u0439 \u043f\u043b\u0430\u043d \u0430\u043a\u0442\u0443\u0430\u043b\u0435\u043d; \u0432\u044b\u043f\u043e\u043b\u043d\u0435\u043d\u0438\u0435 \u0435\u0449\u0451 \u043d\u0435 \u043d\u0430\u0447\u0430\u0442\u043e.", projectRoute("/project-execution-plan", projectId));
      return actionModel("ready", "open-plan", "\u041f\u043e\u0434\u0433\u043e\u0442\u043e\u0432\u0438\u0442\u044c \u043f\u043b\u0430\u043d \u0440\u0430\u0431\u043e\u0442\u044b", `${input.calculationState.finalStitchCount} \u043f\u0435\u0442\u0435\u043b\u044c \u043f\u043e\u0434\u0442\u0432\u0435\u0440\u0436\u0434\u0435\u043d\u044b. YarnAI \u043e\u0442\u0434\u0435\u043b\u0438\u0442 \u0434\u043e\u0441\u0442\u043e\u0432\u0435\u0440\u043d\u044b\u0435 \u0431\u0443\u0434\u0443\u0449\u0438\u0435 \u0448\u0430\u0433\u0438 \u043e\u0442 \u0443\u0441\u043b\u043e\u0432\u043d\u044b\u0445.`, projectRoute("/project-execution-plan", projectId));
    }
    if (input.calculationState?.stale === true) {
      return actionModel("stale", "open-calculation", "\u041d\u0430\u0447\u0430\u043b\u044c\u043d\u044b\u0439 \u0440\u0430\u0441\u0447\u0451\u0442 \u043d\u0443\u0436\u043d\u043e \u043e\u0431\u043d\u043e\u0432\u0438\u0442\u044c", "\u0418\u0441\u0445\u043e\u0434\u043d\u044b\u0435 \u0434\u0430\u043d\u043d\u044b\u0435 \u0438\u0437\u043c\u0435\u043d\u0438\u043b\u0438\u0441\u044c. \u041f\u0440\u0435\u0436\u043d\u044f\u044f \u0440\u0435\u0432\u0438\u0437\u0438\u044f \u0441\u043e\u0445\u0440\u0430\u043d\u0435\u043d\u0430 \u0432 \u0438\u0441\u0442\u043e\u0440\u0438\u0438.", projectRoute("/project-calculation-entry", projectId), ["calculation-stale"]);
    }
    const progress = latestWorkingProgress(input.progressRecords, projectId);
    if (progress) {
      return actionModel("ready", "continue-project", "Продолжить вязание", "YarnAI откроет последний актуальный шаг проекта.", progressDestination(progress, projectId));
    }
    if (input.gaugeKnown === true) {
      return actionModel("ready", "open-calculation", "\u041f\u0435\u0440\u0435\u0439\u0442\u0438 \u043a \u043d\u0430\u0447\u0430\u043b\u044c\u043d\u043e\u043c\u0443 \u0440\u0430\u0441\u0447\u0451\u0442\u0443", "\u041f\u043b\u043e\u0442\u043d\u043e\u0441\u0442\u044c \u043f\u043e\u0434\u0442\u0432\u0435\u0440\u0436\u0434\u0435\u043d\u0430 \u2014 YarnAI \u0440\u0430\u0441\u0441\u0447\u0438\u0442\u0430\u0435\u0442 \u043f\u0435\u0440\u0432\u043e\u0435 \u043a\u043e\u043d\u043a\u0440\u0435\u0442\u043d\u043e\u0435 \u0447\u0438\u0441\u043b\u043e \u0438\u0437 \u0434\u0430\u043d\u043d\u044b\u0445 \u043f\u0440\u043e\u0435\u043a\u0442\u0430.", projectRoute("/project-calculation-entry", projectId));
    }
    return actionModel("ready", "start-swatch", "Начать с образца", "Свяжите небольшой образец, чтобы YarnAI рассчитал изделие по вашей плотности.", projectRoute("/user-workspace-entry", projectId, "swatch-assistant"));
  }

  function materialKind(source = {}) {
    const mime = String(source.media_type || source.source_mime || source.type || "").toLowerCase();
    const name = String(source.display_name || source.displayName || source.name || "").toLowerCase();
    if (mime.startsWith("image/")) return source.purpose === "PATTERN_REFERENCE" ? "diagram" : "photo";
    if (mime === "application/pdf" || name.endsWith(".pdf")) return "pdf";
    if (mime.startsWith("text/") || /\.(txt|md|markdown)$/.test(name)) return "text";
    return "unsupported";
  }

  function materialTypeLabel(kind) {
    return ({ photo: "Фотография", diagram: "Изображение схемы", pdf: "PDF", text: "Текстовое описание", unsupported: "Неподдерживаемый формат" })[kind];
  }

  function collectProjectMaterials(input = {}) {
    const projectId = normalizedIdentity(input.projectId);
    const progressMaterials = new Map();
    (Array.isArray(input.progressRecords) ? input.progressRecords : []).forEach((record) => {
      if (record?.project_id !== projectId || record?.kind !== "PATTERN_IMPORT") return;
      (Array.isArray(record.state?.materials) ? record.state.materials : []).forEach((material) => {
        if (text(material?.id)) progressMaterials.set(material.id, material);
      });
    });
    const values = [];
    (Array.isArray(input.photos) ? input.photos : []).forEach((photo) => {
      if (!isRecord(photo) || photo.project_id !== projectId || photo.deleted_at) return;
      const kind = materialKind(photo);
      values.push({
        id: photo.photo_id,
        projectId,
        name: text(photo.display_name) || "Фотография изделия",
        kind,
        typeLabel: materialTypeLabel(kind),
        source: photo.purpose === "PATTERN_REFERENCE" ? "Добавлено как схема" : "Добавлено в проект",
        availability: photo.status === "READY" ? "available" : "broken",
        availabilityLabel: photo.status === "READY" ? "Доступно" : "Файл недоступен",
        preview: kind === "photo" || kind === "diagram",
        reference: Object.freeze({ storage: "photo", id: photo.photo_id }),
      });
    });
    (Array.isArray(input.patternFiles) ? input.patternFiles : []).forEach((file) => {
      if (!isRecord(file) || file.project_id !== projectId) return;
      const progressMaterial = progressMaterials.get(file.material_id);
      const kind = materialKind(file);
      const supported = MATERIAL_MIME_ALLOWLIST.some((allowed) => allowed.endsWith("/") ? String(file.media_type || "").startsWith(allowed) : file.media_type === allowed) || kind !== "unsupported";
      values.push({
        id: file.pattern_file_id,
        projectId,
        name: text(file.display_name) || text(progressMaterial?.displayName) || "Материал проекта",
        kind: supported ? kind : "unsupported",
        typeLabel: materialTypeLabel(supported ? kind : "unsupported"),
        source: progressMaterial ? "Импорт материалов" : "Добавлено в проект",
        availability: supported ? "available" : "unsupported",
        availabilityLabel: supported ? "Доступно" : "Формат не поддерживается",
        preview: supported,
        reference: Object.freeze({ storage: "pattern", materialId: file.material_id }),
      });
    });
    return Object.freeze(values.map(Object.freeze));
  }

  function projectCalculationState(aggregate, initialization) {
    const domain = globalObject.YarnAIProjectCalculationEntry;
    const gauge = globalObject.YarnAISwatchGauge;
    if (!domain || !gauge || !aggregate?.project || !initialization) return null;
    const records = (Array.isArray(aggregate.calculations) ? aggregate.calculations : [])
      .filter((entry) => entry?.request?.project_calculation_entry?.kind === domain.KIND);
    if (!records.length) return null;
    const active = records.find((entry) => entry.calculation_id === aggregate.project.active_calculation_id) || records.at(-1);
    try {
      const snapshot = domain.validateSnapshot(active.result?.snapshot);
      const history = gauge.normalizeHistory(aggregate.project.draft_input?.[gauge.HISTORY_KEY], { projectIdentity: aggregate.project.project_id });
      const currentGauge = history.records.at(-1);
      const initializationFingerprint = initialization.integrity?.recordFingerprint || initialization.snapshot_fingerprint;
      const current = snapshot.lifecycle === "completed"
        && snapshot.sourceIdentities.initialization === initialization.identity
        && snapshot.sourceFingerprints.initialization === initializationFingerprint
        && snapshot.sourceIdentities.gaugeRevision === currentGauge?.identity
        && snapshot.sourceFingerprints.gauge === currentGauge?.fingerprint;
      return Object.freeze({ current, stale: !current, finalStitchCount: snapshot.finalStitchCount, snapshot });
    } catch {
      return Object.freeze({ current: false, stale: true, corrupted: true });
    }
  }

  function projectExecutionPlanState(aggregate, calculationState) {
    const domain = globalObject.YarnAIProjectExecutionPlan;
    const record = aggregate?.progress?.filter((entry) => entry?.kind === domain?.PROGRESS_KIND && entry?.calculation_id === aggregate?.project?.active_calculation_id).at(-1);
    if (!domain || !record || !calculationState?.current) return Object.freeze({ completed: false, current: false });
    try {
      const state = domain.validateProgressState(record.state, { projectIdentity: aggregate.project.project_id, calculationId: aggregate.project.active_calculation_id });
      const snapshot = state.history.at(-1) || null;
      const current = snapshot?.sourceFingerprints?.calculation === calculationState.snapshot.fingerprint;
      return Object.freeze({ completed: Boolean(snapshot), current, stale: Boolean(snapshot && !current), snapshot });
    } catch { return Object.freeze({ completed: false, current: false, corrupted: true }); }
  }

  function buildProjectWorkspaceViewModel(input = {}) {
    const project = isRecord(input.aggregate?.project) ? input.aggregate.project : input.project;
    const initialization = input.initializationAssessment?.existing || input.initialization;
    const snapshot = initialization?.snapshot || null;
    const materials = collectProjectMaterials({
      projectId: projectIdOf(project),
      photos: input.aggregate?.photos,
      patternFiles: input.patternFiles,
      progressRecords: input.aggregate?.progress,
    });
    const garment = snapshot?.garment || {};
    const calculationState = projectCalculationState(input.aggregate, initialization);
    const planState = projectExecutionPlanState(input.aggregate, calculationState);
    return Object.freeze({
      project: Object.freeze({
        id: projectIdOf(project),
        title: text(project?.title) || "Проект",
        garmentType: text(garment.type) || "Изделие",
        recipient: text(garment.recipient) || "",
        fit: text(garment.fit) || "",
        sizeMode: text(garment.sizeMode) || "",
        standardSize: text(garment.standardSize) || "",
      }),
      snapshot,
      materials,
      mainMaterial: materials.find((entry) => entry.preview && ["photo", "diagram"].includes(entry.kind)) || null,
      nextAction: determineNextAction({
        projectId: projectIdOf(project),
        initializationAssessment: input.initializationAssessment,
        initialization,
        progressRecords: input.aggregate?.progress,
        gaugeKnown: input.gaugeKnown,
        calculationState,
        planState,
        continuationProjection: input.continuationProjection,
        materialState: input.materialState || (materials.some((entry) => entry.availability === "broken") ? "broken" : "ready"),
      }),
    });
  }

  class PreviewUrlRegistry {
    constructor(urlApi = globalObject.URL) {
      this.urlApi = urlApi;
      this.urls = new Set();
    }

    create(blob) {
      if (!(blob instanceof Blob) || typeof this.urlApi?.createObjectURL !== "function") return "";
      const url = this.urlApi.createObjectURL(blob);
      this.urls.add(url);
      return url;
    }

    revokeAll() {
      this.urls.forEach((url) => this.urlApi?.revokeObjectURL?.(url));
      this.urls.clear();
    }
  }
  const api = Object.freeze({
    ROUTES,
    WORKSPACE_ACTION_ROUTES,
    PreviewUrlRegistry,
    buildLatestProjectPresentation,
    buildPrimaryActionModel,
    buildProjectWorkspaceViewModel,
    buildWorkspaceViewModel,
    collectProjectMaterials,
    determineNextAction,
    projectCalculationState,
    projectExecutionPlanState,
    displayTitle,
    humanState,
    hasConfirmedGauge,
    isUnsafeProgress,
    activeTechnologyReviewReadyForRouting,
    completedTechnologyReviewReadyForViewing,
    completedTechnologyReviewAction,
    executionPlanAvailableForStaleRouting,
    executionPlanStaleAgainstReview,
    latestWorkingProgress,
    compatibleReadyPatternExecutionProgress,
    compatiblePatternExecutionProgress,
    foundationMeasurementNextAction,
    primaryFabricPreparationNextAction,
    primaryFabricExecutionNextAction,
    primaryFabricMeasurementNextAction,
    nextSectionPlanningNextAction,
    constructionStrategyPlanningNextAction,
    shapingPolicyPlanningNextAction,
    sleeveTargetGeometryPlanningNextAction,
    materialKind,
    projectIdentityFromLocation,
    projectRoute,
    validTimestamp,
  });
  globalObject.YarnAIUserWorkspaceEntry = api;
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
})(typeof window !== "undefined" ? window : globalThis);
