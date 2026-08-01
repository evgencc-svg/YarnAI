"use strict";

(function initializePatternExecutionPlanPage(globalObject) {
  const system = globalObject.YarnAIProjectSystem;
  const planApi = globalObject.YarnAIPatternExecutionPlan;
  const byId = (id) => document.getElementById(id);
  const ui = {
    fatal: byId("execution-plan-fatal"), fatalMessage: byId("execution-plan-fatal-message"),
    workflow: byId("execution-plan-workflow"), title: byId("execution-plan-project-title"),
    status: byId("execution-plan-status"), source: byId("execution-plan-source"),
    sourceRevision: byId("execution-plan-source-revision"), sourceFingerprint: byId("execution-plan-source-fingerprint"),
    planFingerprint: byId("execution-plan-fingerprint"), stateMessage: byId("execution-plan-state-message"),
    build: byId("execution-plan-build"), retry: byId("execution-plan-retry"), rebuild: byId("execution-plan-rebuild"),
    back: byId("execution-plan-back"), navReview: byId("execution-plan-nav-review"), session: byId("execution-plan-session"), error: byId("execution-plan-error"),
    first: byId("execution-plan-first"), firstTitle: byId("execution-plan-first-title"),
    firstDescription: byId("execution-plan-first-description"), firstBlocked: byId("execution-plan-first-blocked"),
    summary: byId("execution-plan-summary"), summaryValues: byId("execution-plan-summary-values"),
    prerequisites: byId("execution-plan-prerequisites"), prerequisiteList: byId("execution-plan-prerequisite-list"),
    components: byId("execution-plan-components"), componentList: byId("execution-plan-component-list"),
    phases: byId("execution-plan-phases"), phaseList: byId("execution-plan-phase-list"),
    dependencies: byId("execution-plan-dependencies"), dependencyList: byId("execution-plan-dependency-list"),
    checkpoints: byId("execution-plan-checkpoints"), checkpointList: byId("execution-plan-checkpoint-list"),
    blockers: byId("execution-plan-blockers"), blockerList: byId("execution-plan-blocker-list"),
    warnings: byId("execution-plan-warnings"), warningList: byId("execution-plan-warning-list"),
    validation: byId("execution-plan-validation"), validationList: byId("execution-plan-validation-list"),
  };
  let repository = null;
  let projectId = null;
  let inspected = null;
  let busy = false;

  initialize().catch((error) => showFatal(error?.userMessage || "Не удалось открыть Stage 22."));

  async function initialize() {
    projectId = new URLSearchParams(globalObject.location.search).get("project");
    if (!projectId) return renderWithoutProject();
    if (!system?.isUuidv7(projectId) || !planApi) return showFatal("Ссылка на проект повреждена.");
    repository = new system.ProjectRepository();
    await repository.initialize();
    const reviewUrl = `/pattern-technology-review?project=${encodeURIComponent(projectId)}`;
    ui.back.href = reviewUrl;
    ui.navReview.href = reviewUrl;
    ui.session.href = `/pattern-execution-session?project=${encodeURIComponent(projectId)}`;
    ui.build.addEventListener("click", () => runOperation(() => planApi.buildForProject(repository, projectId)));
    ui.retry.addEventListener("click", () => runOperation(() => planApi.retryForProject(repository, projectId)));
    ui.rebuild.addEventListener("click", () => runOperation(() => planApi.rebuildForProject(repository, projectId)));
    inspected = await planApi.ensureForProject(repository, projectId);
    render();
  }

  function render() {
    resetSections();
    ui.title.textContent = inspected?.project?.title || "План выполнения";
    const state = inspected?.executionPlan;
    const visibleStatus = inspected?.state === "stale" ? "stale" : state?.status || "waiting";
    ui.status.textContent = statusLabel(visibleStatus);
    ui.status.dataset.status = visibleStatus;
    ui.source.textContent = inspected?.review?.id || "не найден";
    ui.sourceRevision.textContent = String(inspected?.review?.revision ?? "—");
    ui.sourceFingerprint.textContent = inspected?.review?.confirmedSnapshotFingerprint || "—";
    ui.planFingerprint.textContent = state?.planFingerprint || "—";
    ui.build.hidden = true;
    ui.retry.hidden = true;
    ui.rebuild.hidden = true;
    ui.session.hidden = true;
    if (!inspected || inspected.state === "missing_project") return renderUnavailable("Проект или активный расчёт не найден.");
    if (["review_missing", "source_invalid"].includes(inspected.state) && !state?.plan) {
      return renderUnavailable(sourceProblem(inspected.reasonCode));
    }
    if (!state) return renderUnavailable("Запись Stage 22 ещё не создана.");
    if (inspected.state === "stale" || state.status === "stale") {
      ui.stateMessage.textContent = "Источник изменился. Старый план сохранён для аудита, но использовать его нельзя. После исправления Stage 21 выполните явное перестроение.";
      ui.rebuild.hidden = false;
      if (state.plan) renderPlan(state, false);
      return;
    }
    if (state.status === "waiting") {
      if (inspected.sourceValidation?.isValid) {
        ui.stateMessage.textContent = state.error?.code === "PLANNING_INTERRUPTED" ? "Незавершённое планирование восстановлено. Можно безопасно повторить построение." : "Stage 21 подтверждён и проверен. План ещё не построен.";
        ui.build.hidden = false;
      } else {
        ui.stateMessage.textContent = sourceProblem(inspected.reasonCode);
      }
      return;
    }
    if (state.status === "planning") {
      ui.stateMessage.textContent = `Планирование: ${state.lastSuccessfulPhase || "validate_source"}. Состояние сохранено для восстановления после reload.`;
      return;
    }
    if (state.status === "failed") {
      ui.stateMessage.textContent = state.error?.message || "Планирование завершилось технической или структурной ошибкой.";
      ui.retry.hidden = false;
      renderDiagnostics(state);
      return;
    }
    if (state.status === "blocked") ui.stateMessage.textContent = "Структура плана построена, но начать пока нельзя: устраните перечисленные обязательные блокировки в Stage 21.";
    if (state.status === "ready") {
      ui.stateMessage.textContent = "План готов. Первый доступный шаг определён.";
      ui.session.hidden = false;
    }
    renderPlan(state, state.status === "ready");
  }

  function renderPlan(state, usable) {
    const plan = state.plan;
    if (!plan) return;
    renderFirst(plan.firstAction, state.blockers, usable);
    renderSummary(plan.summary);
    ui.prerequisites.hidden = false;
    replaceList(ui.prerequisiteList, plan.prerequisites, (entry) => `${entry.label}: ${prerequisiteLabel(entry.status)}${entry.relatedTargetIds.length ? ` (источник: ${entry.relatedTargetIds.join(", ")})` : ""}`);
    ui.components.hidden = false;
    ui.componentList.replaceChildren(...plan.components.map(componentNode));
    if (!plan.components.length) ui.componentList.append(emptyNode("Отдельные компоненты не следуют из confirmedSnapshot."));
    ui.phases.hidden = false;
    ui.phaseList.replaceChildren(...plan.phases.map(phaseNode));
    if (!plan.phases.length) ui.phaseList.append(emptyListNode("Фазы не удалось вывести из confirmedSnapshot."));
    ui.dependencies.hidden = false;
    replaceList(ui.dependencyList, plan.dependencyGraph.edges, (entry) => `${phaseName(plan, entry.from)} → ${phaseName(plan, entry.to)}`);
    ui.checkpoints.hidden = false;
    replaceList(ui.checkpointList, plan.checkpoints, (entry) => `${checkpointLabel(entry.type)} — ${phaseName(plan, entry.phaseId)}: ${humanValue(entry.expectedValue)}${entry.unit ? ` ${entry.unit}` : ""}`);
    const blockers = state.blockers || [];
    ui.blockers.hidden = blockers.length === 0;
    replaceList(ui.blockerList, blockers, (entry) => `${entry.code}: ${entry.message}`);
    const warnings = [...(state.warnings || []), ...(plan.unresolved || []).map((entry) => ({ code: entry.code, message: entry.message }))];
    ui.warnings.hidden = warnings.length === 0;
    replaceList(ui.warningList, warnings, (entry) => `${entry.code}: ${entry.message}`);
    renderDiagnostics(state);
  }

  function renderFirst(firstAction, blockers, usable) {
    ui.first.hidden = false;
    ui.firstTitle.textContent = firstAction?.title || "Начало недоступно";
    ui.firstDescription.textContent = firstAction?.description || "Первое действие не определено.";
    const blocking = (blockers || []).filter((entry) => entry.severity === "critical");
    ui.firstBlocked.textContent = usable && firstAction?.ready ? "Первый шаг готов." : `Начать пока нельзя${blocking.length ? `: ${blocking.map((entry) => entry.code).join(", ")}` : "."}`;
  }

  function renderSummary(summary) {
    ui.summary.hidden = false;
    const values = [
      ["Ремесло", summary.craft], ["Изделие", summary.product],
      ["Конструкция", summary.construction], ["Компонентов", summary.componentCount],
      ["Порядок", summary.generalOrder?.map((entry) => entry.title)], ["Блокировки", summary.blocked ? "есть" : "нет"],
    ];
    ui.summaryValues.replaceChildren(...values.map(([label, value]) => definitionNode(label, humanValue(value))));
  }

  function componentNode(component) {
    const node = document.createElement("article");
    node.className = "execution-component";
    const heading = document.createElement("h3");
    heading.textContent = component.label;
    const role = document.createElement("p");
    role.textContent = `Роль: ${component.constructionRole}; статус: ${component.status}.`;
    const refs = document.createElement("p");
    refs.textContent = `Источник: ${component.sourceTargetIds.join(", ") || "не доказан"}.`;
    node.append(heading, role, refs);
    return node;
  }

  function phaseNode(phase) {
    const node = document.createElement("li");
    const heading = document.createElement("h3");
    heading.textContent = phase.title;
    const state = document.createElement("p");
    state.textContent = `Статус: ${phase.status}. Зависит от: ${phase.dependsOnPhaseIds.length ? phase.dependsOnPhaseIds.join(", ") : "ничего"}.`;
    const actions = document.createElement("ul");
    actions.className = "execution-action-list";
    actions.replaceChildren(...phase.actions.map((entry) => { const item = document.createElement("li"); item.textContent = entry.description; return item; }));
    node.append(heading, state, actions);
    return node;
  }

  function renderDiagnostics(state) {
    const diagnostics = state.validation?.diagnostics || [];
    ui.validation.hidden = diagnostics.length === 0;
    replaceList(ui.validationList, diagnostics, (entry) => `${entry.severity}: ${entry.code} — ${entry.message}`);
  }

  async function runOperation(operation) {
    if (busy) return;
    busy = true;
    ui.error.textContent = "";
    setDisabled(true);
    try { inspected = await operation(); }
    catch (error) {
      ui.error.textContent = `${error?.code ? `${error.code}: ` : ""}${error?.userMessage || "Операция не выполнена."}`;
      inspected = await planApi.ensureForProject(repository, projectId);
    } finally {
      busy = false;
      setDisabled(false);
      render();
    }
  }

  function renderWithoutProject() { ui.title.textContent = "План выполнения"; ui.build.hidden = true; ui.retry.hidden = true; ui.rebuild.hidden = true; ui.session.hidden = true; renderUnavailable("Откройте Stage 22 из подтверждённого Stage 21."); }
  function renderUnavailable(message) { ui.stateMessage.textContent = message; ui.status.textContent = "Ожидание Stage 21"; ui.status.dataset.status = "waiting"; }
  function showFatal(message) { ui.workflow.hidden = true; ui.fatal.hidden = false; ui.fatalMessage.textContent = message; }
  function resetSections() { ui.fatal.hidden = true; ui.workflow.hidden = false; for (const section of [ui.first, ui.summary, ui.prerequisites, ui.components, ui.phases, ui.dependencies, ui.checkpoints, ui.blockers, ui.warnings, ui.validation]) section.hidden = true; }
  function setDisabled(value) { for (const button of [ui.build, ui.retry, ui.rebuild]) button.disabled = value; }
  function replaceList(container, entries, formatter) { const nodes = (entries || []).map((entry) => { const node = document.createElement("li"); node.textContent = formatter(entry); return node; }); if (!nodes.length) nodes.push(emptyListNode("Нет элементов.")); container.replaceChildren(...nodes); }
  function definitionNode(label, value) { const wrapper = document.createElement("div"); const term = document.createElement("dt"); term.textContent = label; const description = document.createElement("dd"); description.textContent = value; wrapper.append(term, description); return wrapper; }
  function emptyNode(message) { const node = document.createElement("p"); node.textContent = message; return node; }
  function emptyListNode(message) { const node = document.createElement("li"); node.textContent = message; return node; }
  function phaseName(plan, id) { return plan.phases.find((entry) => entry.id === id)?.title || id; }
  function sourceProblem(code) { return ({ SOURCE_REVIEW_MISSING: "Stage 21 ещё не создан.", SOURCE_REVIEW_NOT_CONFIRMED: "Stage 21 нужно явно подтвердить.", SOURCE_REVIEW_STALE: "Stage 21 устарел; вернитесь и подтвердите актуальную технологию.", SOURCE_SNAPSHOT_MISSING: "В Stage 21 отсутствует confirmedSnapshot.", SOURCE_SNAPSHOT_FINGERPRINT_INVALID: "Fingerprint confirmedSnapshot не прошёл проверку.", SOURCE_IDENTITY_MISMATCH: "Identity Stage 21/20/19/18 не доказуема.", SOURCE_IMPORT_REVISION_MISMATCH: "Import revision источника не совпадает." })[code] || `Stage 21 недоступен: ${code || "неизвестная причина"}.`; }
  function statusLabel(status) { return ({ waiting: "Ожидание Stage 21", planning: "Планирование", ready: "Готов", blocked: "Заблокирован", stale: "Устарел", failed: "Ошибка" })[status] || status; }
  function prerequisiteLabel(status) { return ({ satisfied: "готово", required: "требуется", unresolved: "не подтверждено", not_applicable: "не применяется" })[status] || status; }
  function checkpointLabel(type) { return ({ gauge_check: "Проверка плотности", stitch_count_check: "Проверка петель", dimension_check: "Проверка размера", symmetry_check: "Проверка симметрии", component_completion_check: "Готовность компонента", join_check: "Проверка соединения", fit_check: "Проверка посадки", finishing_check: "Проверка завершения" })[type] || type; }
  function humanValue(value) { if (value === null || value === undefined || value === "") return "не указано"; if (Array.isArray(value)) return value.length ? value.map(humanValue).join(", ") : "нет"; if (typeof value === "object") return Object.keys(value).sort().map((key) => `${key}: ${humanValue(value[key])}`).join("; "); return String(value); }
})(window);
