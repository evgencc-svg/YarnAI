"use strict";

(function initializeUserWorkspaceEntryAssistant(globalObject) {
  if (typeof document === "undefined") {
    return;
  }

  if (globalObject.location.pathname === "/user-workspace-entry") {
    if (globalObject.location.hash !== "#project-details") {
      initializeProjectWorkspace();
    }
    return;
  }

  const projectSystem = globalObject.YarnAIProjectSystem;
  const workspace = globalObject.YarnAIUserWorkspaceEntry;
  const planWorkspace = globalObject.YarnAIProjectExecutionPlanWorkspace;
  const planDomain = globalObject.YarnAIProjectExecutionPlan;
  const startWorkspace = globalObject.YarnAIProjectExecutionStartWorkspace;
  const startDomain = globalObject.YarnAIProjectExecutionStart;
  const firstStepWorkspace = globalObject.YarnAIProjectExecutionFirstStepWorkspace;
  const firstStepDomain = globalObject.YarnAIProjectExecutionFirstStep;
  const nextStepWorkspace = globalObject.YarnAIProjectExecutionNextStepWorkspace;
  const nextStepDomain = globalObject.YarnAIProjectExecutionNextStep;
  const clarificationWorkspace = globalObject.YarnAIProjectExecutionNextStepClarificationWorkspace;
  const clarificationDomain = globalObject.YarnAIProjectExecutionNextStepClarification;
  const foundationPreparationDomain = globalObject.YarnAIFoundationSectionExecutionPreparation;
  const foundationExecutionDomain = globalObject.YarnAIFoundationSectionExecution;
  const foundationMeasurementDomain = globalObject.YarnAIFoundationSectionMeasurement;
  const primaryFabricPreparationDomain = globalObject.YarnAIPrimaryFabricPreparation;
  const calculationDomain = globalObject.YarnAIProjectCalculationEntry;
  const initializationApi = globalObject.YarnAIProjectInitialization;
  const gaugeApi = globalObject.YarnAISwatchGauge;
  const detailsExperience = globalObject.YarnAIProjectDetailsExperience;
  const readinessApi = globalObject.YarnAIProjectReadiness;
  const elements = {
    loading: document.querySelector("#saved-projects-loading"),
    empty: document.querySelector("#saved-projects-empty"),
    error: document.querySelector("#saved-projects-error"),
    list: document.querySelector("#saved-projects-list"),
    latest: document.querySelector("#latest-project"),
    latestEmpty: document.querySelector("#latest-project-empty"),
    status: document.querySelector("#workspace-status"),
    form: document.querySelector("#new-project-form"),
    formPanel: document.querySelector("#new-project-form-panel"),
    title: document.querySelector("#new-project-title"),
    submit: document.querySelector("#new-project-submit"),
    cancel: document.querySelector("#new-project-cancel"),
  };
  let createDestination = "/import-pattern";
  let createTrigger = null;
  let designTrigger = null;

  document.querySelectorAll("[data-create-destination]").forEach((button) => {
    button.addEventListener("click", () => openCreateForm(
      button.dataset.createDestination,
      button,
    ));
  });
  document.querySelectorAll("[data-scroll-target]").forEach((button) => {
    button.addEventListener("click", () => {
      document.querySelector(button.dataset.scrollTarget)?.scrollIntoView({ behavior: "smooth" });
    });
  });
  document.querySelectorAll("[data-open-design]").forEach((button) => {
    button.addEventListener("click", () => openDesignWorkspace(button));
  });
  document.querySelector("#close-design-workspace")?.addEventListener("click", closeDesignWorkspace);
  elements.cancel?.addEventListener("click", closeCreateForm);
  elements.formPanel?.addEventListener("close", restoreCreateFocus);
  elements.formPanel?.addEventListener("keydown", handleCreateDialogKeydown);
  elements.form?.addEventListener("submit", createProject);

  loadWorkspace();

  globalObject.addEventListener("pageshow", (event) => {
    if (event.persisted && globalObject.location.pathname !== "/user-workspace-entry") loadWorkspace();
  });

  function clarificationContinuation(aggregate, projectId, stage68 = null) {
    const clarificationWorkspaceApi = globalObject.YarnAIProjectExecutionNextStepClarificationWorkspace;
    const clarificationDomainApi = globalObject.YarnAIProjectExecutionNextStepClarification;
    const planDomainApi = globalObject.YarnAIProjectExecutionPlan;
    const startDomainApi = globalObject.YarnAIProjectExecutionStart;
    const firstStepDomainApi = globalObject.YarnAIProjectExecutionFirstStep;
    const nextStepDomainApi = globalObject.YarnAIProjectExecutionNextStep;
    if (!clarificationWorkspaceApi || !clarificationDomainApi || !planDomainApi || !startDomainApi || !firstStepDomainApi || !nextStepDomainApi) return null;
    const calculationId = aggregate?.project?.active_calculation_id;
    const progress = Array.isArray(aggregate?.progress) ? aggregate.progress : [];
    const hasClarificationRecord = progress.some((entry) => entry?.kind === clarificationDomainApi.KIND && entry?.calculation_id === calculationId);
    let expectsClarification = stage68?.snapshot?.lifecycle === "unavailable" && stage68.snapshot.reasonCode === "NEXT_STEP_CONDITIONAL";
    if (!hasClarificationRecord && !expectsClarification) {
      const sourceRecord = nextStepDomainApi.latestRecord(progress, nextStepDomainApi.KIND, calculationId);
      try {
        const sourceState = sourceRecord && nextStepDomainApi.validateProgressState(sourceRecord.state, { projectIdentity: projectId, calculationId });
        expectsClarification = sourceState?.snapshot?.lifecycle === "unavailable" && sourceState.snapshot.reasonCode === "NEXT_STEP_CONDITIONAL";
      } catch {
        expectsClarification = false;
      }
    }
    if (!hasClarificationRecord && !expectsClarification) return null;
    const readiness = clarificationWorkspaceApi.assessAggregateReadiness({
      aggregate, projectId, domain: clarificationDomainApi, stage65Domain: planDomainApi,
      stage66Domain: startDomainApi, stage67Domain: firstStepDomainApi, stage68Domain: nextStepDomainApi,
    });
    return { readiness, projection: clarificationWorkspaceApi.continuationProjection(readiness, clarificationDomainApi) };
  }

  function foundationPreparation(aggregate, projectId) {
    const domain = globalObject.YarnAIFoundationSectionExecutionPreparation;
    if (!domain) return null;
    const assessment = domain.assessSource({
      projectId, project: aggregate.project, progress: aggregate.progress, stage63Domain: globalObject.YarnAISwatchGauge,
      stage65Domain: globalObject.YarnAIProjectExecutionPlan, stage66Domain: globalObject.YarnAIProjectExecutionStart,
      stage67Domain: globalObject.YarnAIProjectExecutionFirstStep, stage68Domain: globalObject.YarnAIProjectExecutionNextStep,
      stage69Domain: globalObject.YarnAIProjectExecutionNextStepClarification,
    });
    const calculationId = aggregate.project.active_calculation_id;
    const records = aggregate.progress.filter((entry) => entry?.kind === domain.KIND && entry?.project_id === projectId && entry?.calculation_id === calculationId && !entry.deleted_at);
    if (assessment.lifecycle !== "ready") return { status: "blocked", diagnostic: assessment.diagnostic };
    if (!records.length) return { status: "ready" };
    records.sort((left, right) => left.epoch - right.epoch);
    try {
      records.forEach((entry) => { if (entry.epoch !== entry.state?.epoch || entry.conflict_id) throw new Error("conflict"); domain.validateProgressState(entry.state, { assessment }); });
      const current = records.at(-1);
      const nonterminal = records.filter((entry) => !["stale", "completed"].includes(entry.state.lifecycle));
      if (nonterminal.length > 1 || (nonterminal.length && nonterminal[0] !== current)) throw new Error("conflict");
      return { status: current.state.lifecycle, record: current };
    } catch { return { status: "blocked", diagnostic: domain.diagnostic("PREPARATION_RECORD_CONFLICT") }; }
  }

  function foundationExecution(aggregate, projectId) {
    const domain = globalObject.YarnAIFoundationSectionExecution;
    if (!domain) return null;
    const assessment = domain.assessSource({
      projectId, project: aggregate.project, progress: aggregate.progress, stage63Domain: globalObject.YarnAISwatchGauge,
      stage65Domain: globalObject.YarnAIProjectExecutionPlan, stage66Domain: globalObject.YarnAIProjectExecutionStart,
      stage67Domain: globalObject.YarnAIProjectExecutionFirstStep, stage68Domain: globalObject.YarnAIProjectExecutionNextStep,
      stage69Domain: globalObject.YarnAIProjectExecutionNextStepClarification, stage70Domain: globalObject.YarnAIFoundationSectionExecutionPreparation,
    });
    if (assessment.lifecycle !== "ready") return null;
    const records = aggregate.progress.filter((entry) => entry?.kind === domain.KIND && entry?.project_id === projectId && entry?.calculation_id === assessment.calculationId && !entry.deleted_at);
    if (!records.length) return { status: null };
    if (records.length !== 1 || records[0].conflict_id || records[0].quarantined || records[0].validation_status === "IMPORTED_UNPROVEN") return null;
    try { return { status: domain.validateProgressState(records[0].state, { assessment }).lifecycle, record: records[0] }; }
    catch { return null; }
  }

  function foundationMeasurement(aggregate, projectId, execution) {
    const domain = globalObject.YarnAIFoundationSectionMeasurement; if (!domain) return null;
    const calculationId = aggregate.project.active_calculation_id;
    const records = aggregate.progress.filter((entry) => entry?.kind === domain.KIND && entry?.project_id === projectId && entry?.calculation_id === calculationId && !entry.deleted_at);
    const boundary = domain.resolveAuthoritativeHistory(records); const current = boundary.authoritativeState && { entry: boundary.authoritativeRecord, state: boundary.authoritativeState };
    if (boundary.terminalReached) return { status: "completed_target", record: current.entry, ready: false };
    if (boundary.status !== "valid") return { status: "blocked", record: current?.entry || null, ready: false, diagnostic: boundary.diagnostic };
    if (!current) return null;
    if (current.state.lifecycle === "collecting" || current.state.lifecycle === "reviewing") {
      const assessment = domain.assessSource({ projectId, project: aggregate.project, progress: aggregate.progress, stage63Domain: globalObject.YarnAISwatchGauge, stage65Domain: globalObject.YarnAIProjectExecutionPlan, stage66Domain: globalObject.YarnAIProjectExecutionStart, stage67Domain: globalObject.YarnAIProjectExecutionFirstStep, stage68Domain: globalObject.YarnAIProjectExecutionNextStep, stage69Domain: globalObject.YarnAIProjectExecutionNextStepClarification, stage70Domain: globalObject.YarnAIFoundationSectionExecutionPreparation, stage71Domain: globalObject.YarnAIFoundationSectionExecution });
      try { if (assessment.lifecycle !== "ready") throw new Error("stale"); domain.validateProgressState(current.state, { assessment }); return { status: current.state.lifecycle, record: current.entry, ready: false }; }
      catch { return { status: "blocked", record: current.entry, ready: false, diagnostic: domain.diagnostic("SOURCE_STALE") }; }
    }
    const executionRevision = execution?.record?.state?.revision || 0; const ready = execution?.status === "paused" && executionRevision > current.state.source.executionStateRevision;
    return { status: "completed_below", record: current.entry, ready };
  }

  function primaryFabricPreparation(aggregate, projectId) {
    const domain = globalObject.YarnAIPrimaryFabricPreparation; if (!domain) return null;
    const assessment = domain.assessSource({ projectId, project: aggregate.project, progress: aggregate.progress, stage63Domain: globalObject.YarnAISwatchGauge, stage65Domain: globalObject.YarnAIProjectExecutionPlan, stage66Domain: globalObject.YarnAIProjectExecutionStart, stage67Domain: globalObject.YarnAIProjectExecutionFirstStep, stage68Domain: globalObject.YarnAIProjectExecutionNextStep, stage69Domain: globalObject.YarnAIProjectExecutionNextStepClarification, stage70Domain: globalObject.YarnAIFoundationSectionExecutionPreparation, stage71Domain: globalObject.YarnAIFoundationSectionExecution, stage72Domain: globalObject.YarnAIFoundationSectionMeasurement });
    const calculationId = aggregate.project.active_calculation_id;
    const records = aggregate.progress.filter((entry) => entry?.kind === domain.KIND && entry?.project_id === projectId && entry?.calculation_id === calculationId && !entry.deleted_at);
    if (assessment.lifecycle !== "ready") return { status: "blocked", diagnostic: assessment.diagnostic };
    if (!records.length) return { status: "ready", diagnostic: null };
    if (records.length !== 1 || records[0].conflict_id || records[0].quarantined || records[0].validation_status === "IMPORTED_UNPROVEN" || records[0].imported_unproven) return { status: "blocked", diagnostic: domain.diagnostic("REVISION_CONFLICT") };
    try { return { status: domain.validateProgressState(records[0].state, { assessment }).lifecycle, record: records[0], diagnostic: null }; }
    catch (problem) { return { status: "blocked", record: records[0], diagnostic: domain.diagnostic(problem?.code || "SOURCE_STALE", problem?.userMessage || problem?.message) }; }
  }

  async function loadWorkspace() {
    if (!projectSystem || !workspace) {
      showError();
      return;
    }
    let repository;
    try {
      repository = new projectSystem.ProjectRepository();
      await repository.initialize();
      const projects = await repository.listProjects({ section: "active" });
      const progressRecords = [];
      const safeProjects = await Promise.all(projects.map(async (project) => {
        try {
          const aggregate = await repository.getProject(project.project_id);
          progressRecords.push(...aggregate.progress);
          const stage65Candidate = aggregate.calculations.some((entry) => entry?.calculation_id === project.active_calculation_id && entry?.request?.project_calculation_entry?.kind === "PROJECT_CALCULATION_ENTRY" && entry?.result?.snapshot?.lifecycle === "completed");
          const stage65Assessment = stage65Candidate && planWorkspace && planDomain && calculationDomain && initializationApi && gaugeApi && detailsExperience && readinessApi
            ? planWorkspace.assessAggregateReadiness({ aggregate, projectId: project.project_id, domain: planDomain, calculationDomain, initialization: initializationApi, gauge: gaugeApi, experience: detailsExperience, readiness: readinessApi })
            : null;
          const stage65Ready = stage65Assessment?.ready === true;
          const stage65Completed = aggregate.progress.some((entry) => entry?.kind === "PROJECT_EXECUTION_PLAN_PREPARATION" && entry?.state?.history?.length && entry.state.currentRevisionIdentity);
          const stage66 = stage65Completed && startWorkspace && startDomain
            ? startWorkspace.assessAggregateReadiness({ aggregate, projectId: project.project_id, domain: startDomain, planDomain, planWorkspace, calculationDomain, initialization: initializationApi, gauge: gaugeApi, experience: detailsExperience, readiness: readinessApi })
            : null;
          const stage66Status = stage66?.started ? "started" : stage66?.ready ? "ready" : stage65Completed && stage66 ? "blocked" : null;
          const stage67 = stage66?.started && firstStepWorkspace && firstStepDomain
            ? firstStepWorkspace.assessAggregateReadiness({ aggregate, projectId: project.project_id, domain: firstStepDomain, stage66Domain: startDomain })
            : null;
          const stage67Status = stage67?.ready
            ? stage67.snapshot?.lifecycle || "ready"
            : stage66?.started && stage67 ? "blocked" : null;
          const stage68 = stage67Status === "completed" && nextStepWorkspace && nextStepDomain
            ? nextStepWorkspace.assessAggregateReadiness({ aggregate, projectId: project.project_id, domain: nextStepDomain, stage65Domain: planDomain, stage66Domain: startDomain, stage67Domain: firstStepDomain })
            : null;
          const stage68Status = stage68?.ready ? stage68.snapshot?.lifecycle || stage68.assessment?.lifecycle : stage67Status === "completed" && stage68 ? "blocked" : null;
          const stage69 = clarificationContinuation(aggregate, project.project_id, stage68);
          const stage69Status = stage69?.readiness?.lifecycle || null;
          const preparation = foundationPreparationDomain && stage69Status === "completed" ? foundationPreparation(aggregate, project.project_id) : null;
          const execution = foundationExecutionDomain && preparation?.status === "completed" ? foundationExecution(aggregate, project.project_id) : null;
          const measurement = foundationMeasurementDomain && preparation?.status === "completed" ? foundationMeasurement(aggregate, project.project_id, execution) : null;
          const hasPrimaryFabricPreparation = aggregate.progress.some((entry) => entry?.kind === primaryFabricPreparationDomain?.KIND && !entry.deleted_at);
          const primaryFabric = primaryFabricPreparationDomain && (measurement?.status === "completed_target" || hasPrimaryFabricPreparation) ? primaryFabricPreparation(aggregate, project.project_id) : null;
          const recovery = stage66?.diagnostic?.recovery;
          const recoveryHref = recovery?.path === "/saved-projects"
            ? "/saved-projects"
            : recovery?.path ? workspace.projectRoute(recovery.path, project.project_id) : workspace.projectRoute("/project-execution-start", project.project_id);
          return {
            ...project,
            workspace_stage65_ready: stage65Ready,
            workspace_stage65_completed: stage65Ready && stage65Completed,
            workspace_stage65_problem: stage65Candidate && !stage65Ready ? stage65Assessment?.problem || { label: "Открыть проект", href: workspace.projectRoute("/user-workspace-entry", project.project_id) } : null,
            workspace_stage67_status: stage67Status,
            workspace_stage68_status: stage68Status,
            workspace_stage69_status: stage69Status,
            workspace_continuation: stage69?.projection || null,
            workspace_foundation_preparation_status: preparation?.status || null,
            workspace_foundation_execution_status: execution?.status || null,
            workspace_foundation_measurement_status: measurement?.status || null,
            workspace_foundation_measurement_ready: measurement?.ready === true,
            workspace_foundation_measurement_problem: measurement?.diagnostic || null,
            workspace_primary_fabric_preparation_status: primaryFabric?.status || null,
            workspace_primary_fabric_preparation_problem: primaryFabric?.diagnostic || null,
            workspace_stage67_problem: stage67Status === "blocked"
              ? { label: "\u0412\u0435\u0440\u043d\u0443\u0442\u044c\u0441\u044f \u043a \u043f\u0440\u043e\u0435\u043a\u0442\u0430\u043c", href: "/saved-projects", code: stage67?.diagnostic?.code } : null,
            workspace_stage66_status: stage66Status,
            workspace_stage66_problem: stage66Status === "blocked" ? { label: recovery?.label || "Проверить причину блокировки", href: recoveryHref, code: stage66?.diagnostic?.code } : null,
          };
        } catch {
          return { ...project, workspace_unavailable: true };
        }
      }));
      render(workspace.buildWorkspaceViewModel(safeProjects, progressRecords));
    } catch {
      showError();
    } finally {
      await repository?.close().catch(() => undefined);
    }
  }

  function render(model) {
    elements.loading.hidden = true;
    elements.error.hidden = true;
    elements.empty.hidden = !model.empty;
    elements.list.hidden = model.empty;
    elements.list.replaceChildren(...model.projects.map(projectCard));
    renderLatest(model.latestProject);
  }

  function renderLatest(project) {
    elements.latest.hidden = !project;
    elements.latestEmpty.hidden = Boolean(project);
    if (!project) {
      elements.latest.replaceChildren();
      return;
    }
    elements.latest.replaceChildren(projectCard(project, true));
  }

  function projectCard(project, featured = false) {
    const card = document.createElement("article");
    card.className = featured
      ? "saved-project-card saved-project-card-featured"
      : "saved-project-card";
    card.dataset.projectId = project.id;
    const content = document.createElement("div");
    const title = document.createElement(featured ? "h2" : "h3");
    title.textContent = project.title;
    const meta = document.createElement("p");
    meta.className = "saved-project-meta";
    meta.textContent = [project.type, project.state].filter(Boolean).join(" · ");
    content.append(title, meta);
    if (project.summary) {
      const summary = document.createElement("p");
      summary.className = "saved-project-summary";
      summary.textContent = project.summary;
      content.append(summary);
    }
    if (project.completedTechnologyReview) {
      const historyLink = document.createElement("a");
      historyLink.className = "saved-project-history";
      historyLink.href = project.completedTechnologyReview.href;
      historyLink.textContent = project.completedTechnologyReview.label;
      content.append(historyLink);
    }
    const backupCopy = document.createElement("p");
    backupCopy.className = "saved-project-backup-copy";
    backupCopy.textContent = "Включает проект, исходный PDF и связанные файлы.";
    content.append(backupCopy);
    const actions = document.createElement("div");
    actions.className = "saved-project-actions";
    if (project.action) {
      const link = document.createElement("a");
      link.className = "saved-project-continue";
      link.href = project.action.href;
      link.textContent = project.action.label;
      actions.append(link);
    }
    const backupButton = document.createElement("button");
    backupButton.type = "button";
    backupButton.className = "saved-project-backup";
    backupButton.dataset.fullProjectBackup = project.id;
    backupButton.textContent = "Скачать полную резервную копию";
    actions.append(backupButton);
    card.append(content, actions);
    return card;
  }

  function openCreateForm(destination, trigger) {
    createDestination = destination || "/import-pattern";
    createTrigger = trigger || document.activeElement;
    elements.form.reset();
    elements.status.textContent = "";
    if (typeof elements.formPanel.showModal === "function") {
      if (!elements.formPanel.open) {
        elements.formPanel.showModal();
      }
    } else {
      elements.formPanel.setAttribute("open", "");
    }
    globalObject.requestAnimationFrame?.(() => elements.title.focus());
  }

  function handleCreateDialogKeydown(event) {
    if (event.key === "Escape") {
      event.preventDefault();
      closeCreateForm();
    }
  }

  function closeCreateForm() {
    elements.form.reset();
    elements.status.textContent = "";
    if (typeof elements.formPanel.close === "function" && elements.formPanel.open) {
      elements.formPanel.close();
      return;
    }
    elements.formPanel.removeAttribute("open");
    restoreCreateFocus();
  }

  function restoreCreateFocus() {
    createTrigger?.focus?.();
    createTrigger = null;
  }

  function openDesignWorkspace(trigger) {
    designTrigger = trigger;
    document.querySelector("#new-dialog-button")?.click();
    const target = document.querySelector(trigger.dataset.openDesign);
    if (!target) {
      return;
    }
    target.hidden = false;
    target.scrollIntoView({ behavior: "smooth", block: "start" });
    globalObject.requestAnimationFrame?.(() => document.querySelector("#choose-photo")?.focus());
  }

  function closeDesignWorkspace() {
    const target = document.querySelector("#start-screen");
    if (target) {
      target.hidden = true;
    }
    designTrigger?.focus?.();
    designTrigger = null;
  }

  async function createProject(event) {
    event.preventDefault();
    const title = elements.title.value.trim();
    if (!title) {
      elements.status.textContent = "Напиши название проекта.";
      elements.title.focus();
      return;
    }
    elements.submit.disabled = true;
    let repository;
    try {
      repository = new projectSystem.ProjectRepository();
      await repository.initialize();
      const destination = new URL(createDestination, globalObject.location.origin);
      const intent = destination.searchParams.get("intent") === "garment_reference"
        ? "garment_reference"
        : "pattern_source";
      const project = await repository.createProject({
        title,
        draft_input: {
          workflow_intent: { version: 1, kind: intent },
        },
      });
      destination.searchParams.set("project", project.project_id);
      globalObject.location.assign(`${destination.pathname}${destination.search}`);
    } catch {
      elements.status.textContent = "Не удалось создать проект. Можно попробовать ещё раз.";
      elements.submit.disabled = false;
    } finally {
      await repository?.close().catch(() => undefined);
    }
  }

  function showError() {
    elements.loading.hidden = true;
    elements.empty.hidden = true;
    elements.list.hidden = true;
    elements.latest.hidden = true;
    elements.latestEmpty.hidden = false;
    elements.error.hidden = false;
    elements.error.textContent = "Не удалось открыть сохранённые проекты. Можно попробовать обновить страницу.";
    elements.status.textContent = elements.error.textContent;
  }

  function initializeProjectWorkspace() {
    const system = globalObject.YarnAIProjectSystem;
    const workspace = globalObject.YarnAIUserWorkspaceEntry;
    const initializationApi = globalObject.YarnAIProjectInitialization;
    const experience = globalObject.YarnAIProjectDetailsExperience;
    const readinessApi = globalObject.YarnAIProjectReadiness;
    const root = document.querySelector("#project-workspace");
    const ui = {
      loading: document.querySelector("#project-workspace-loading"),
      missing: document.querySelector("#project-workspace-missing"),
      blocked: document.querySelector("#project-workspace-blocked"),
      blockedTitle: document.querySelector("#project-workspace-blocked-title"),
      blockedCopy: document.querySelector("#project-workspace-blocked-copy"),
      reviewLink: document.querySelector("#project-workspace-review-link"),
      ready: document.querySelector("#project-workspace-ready"),
      title: document.querySelector("#project-workspace-title"),
      garment: document.querySelector("#project-workspace-garment"),
      recipient: document.querySelector("#project-workspace-recipient"),
      size: document.querySelector("#project-workspace-size"),
      readiness: document.querySelector("#project-workspace-readiness"),
      detailsLink: document.querySelector("#project-workspace-details-link"),
      confirmedDetailsLink: document.querySelector("#workspace-confirmed-details-link"),
      nextTitle: document.querySelector("#workspace-next-action-title"),
      nextCopy: document.querySelector("#workspace-next-action-copy"),
      primaryAction: document.querySelector("#workspace-primary-action"),
      actionStatus: document.querySelector("#workspace-action-status"),
      productImage: document.querySelector("#workspace-product-image"),
      productPlaceholder: document.querySelector("#workspace-product-placeholder"),
      productTitle: document.querySelector("#workspace-product-title"),
      productDescription: document.querySelector("#workspace-product-description"),
      productSize: document.querySelector("#workspace-product-size"),
      productFit: document.querySelector("#workspace-product-fit"),
      productSource: document.querySelector("#workspace-product-source"),
      materialsCount: document.querySelector("#workspace-materials-count"),
      materialsEmpty: document.querySelector("#workspace-materials-empty"),
      materialsList: document.querySelector("#workspace-materials-list"),
      materialInput: document.querySelector("#workspace-material-input"),
      materialPurpose: document.querySelector("#workspace-material-purpose"),
      materialStatus: document.querySelector("#workspace-material-status"),
      descriptionForm: document.querySelector("#workspace-description-form"),
      description: document.querySelector("#workspace-description"),
      descriptionSubmit: document.querySelector("#workspace-description-submit"),
      confirmedFacts: document.querySelector("#workspace-confirmed-facts"),
      assumptions: document.querySelector("#workspace-assumptions"),
      assumptionsEmpty: document.querySelector("#workspace-assumptions-empty"),
      warnings: document.querySelector("#workspace-warnings"),
      warningsEmpty: document.querySelector("#workspace-warnings-empty"),
    };
    let repository = null;
    let projectId = "";
    let currentModel = null;
    let currentContext = null;
    let busy = false;
    const previews = workspace ? new workspace.PreviewUrlRegistry(globalObject.URL) : null;

    document.body.classList.add("is-project-workspace");
    root.hidden = false;
    ui.primaryAction.addEventListener("click", followPrimaryAction);
    ui.materialInput.addEventListener("change", saveSelectedMaterial);
    ui.descriptionForm.addEventListener("submit", saveDescription);
    document.querySelector("#swatch-form")?.addEventListener("submit", continueFromSwatch);
    globalObject.addEventListener("pagehide", cleanup, { once: true });
    globalObject.addEventListener("hashchange", () => {
      if (globalObject.location.hash === "#swatch-assistant") activateSwatchRoute();
    });

    start().catch(renderFatal);

    async function start() {
      if (!system || !workspace || !initializationApi || !experience || !readinessApi) {
        throw new Error("WORKSPACE_DEPENDENCY_MISSING");
      }
      projectId = workspace.projectIdentityFromLocation(globalObject.location, system.isUuidv7);
      if (!projectId) {
        renderMissing();
        return;
      }
      repository = new system.ProjectRepository();
      await repository.initialize();
      await refresh();
      if (globalObject.location.hash === "#swatch-assistant") activateSwatchRoute();
    }

    function sourceInputFromAggregate(aggregate) {
      const context = experience.contextFromAggregate(aggregate);
      if (!context.project || context.project.project_id !== projectId) {
        throw new initializationApi.ProjectInitializationError("PROJECT_ID_MISMATCH", "Открыт другой проект. Работа остановлена.");
      }
      const effectiveIntent = experience.applyDetailsToIntent(context.intent, context.details);
      const draftIntent = context.project.draft_input?.project_intent
        || context.project.draft_input?.projectIntent
        || {};
      const initializationIntent = experience.applyDetailsToIntent(draftIntent, context.details);
      const readiness = readinessApi.evaluateProjectReadiness(initializationIntent);
      const safety = experience.progressSafety(context.relevantProgress);
      const swatchDestination = {
        enabled: true,
        href: workspace.projectRoute("/swatch-assistant", projectId),
        label: "Перейти к образцу",
        description: "Следующий шаг — образец и плотность.",
      };
      const presentedDestination = experience.readinessPresentation({
        details: context.details,
        garmentType: initializationIntent.garmentType,
        technology: context.technology,
        readiness,
        safe: safety.safe,
        swatchHref: swatchDestination.href,
      }).action;
      const nextDestination = presentedDestination.enabled || !safety.safe ? presentedDestination : swatchDestination;
      return {
        context,
        effectiveIntent,
        input: {
          projectIdentity: projectId,
          closureHistory: context.closureHistory,
          initializationHistory: context.project.draft_input?.[initializationApi.HISTORY_KEY],
          nextDestination,
          liveInput: {
            projectId,
            garmentType: initializationIntent.garmentType || "изделие",
            details: context.details,
            technology: context.technology,
            intent: initializationIntent,
            collaborationState: context.collaborationState,
            safe: safety.safe,
            nextDestination,
          },
        },
      };
    }

    async function refresh(options = {}) {
      ui.loading.hidden = false;
      ui.missing.hidden = true;
      ui.blocked.hidden = true;
      try {
        const aggregate = await repository.getProject(projectId);
        if (aggregate.project.project_id !== projectId) throw new Error("PROJECT_ID_MISMATCH");
        const patternFiles = await repository.listPatternFiles(projectId);
        const source = sourceInputFromAggregate(aggregate);
        const assessment = initializationApi.assessInitialization(source.input);
        let latest = null;
        try {
          latest = initializationApi.latestInitialization(
            source.input.initializationHistory,
            { projectIdentity: projectId },
          );
        } catch {
          latest = null;
        }
        currentContext = source;
        const continuation = clarificationContinuation(aggregate, projectId);
        const modelInput = {
          aggregate,
          patternFiles,
          initializationAssessment: assessment,
          initialization: latest,
          gaugeKnown: hasConfirmedGauge(source.effectiveIntent),
          continuationProjection: continuation?.projection || null,
        };
        const preliminaryModel = workspace.buildProjectWorkspaceViewModel(modelInput);
        const materialState = await inspectMaterialReferences(preliminaryModel.materials);
        currentModel = materialState === "ready"
          ? preliminaryModel
          : workspace.buildProjectWorkspaceViewModel({ ...modelInput, materialState });
        renderModel(currentModel);
        if (!options.preserveStatus) setMaterialStatus("", "");
        return currentModel;
      } catch (error) {
        if (error?.code === "PROJECT_NOT_FOUND" || error?.code === "INVALID_PROJECT_ID") {
          renderMissing();
          return null;
        }
        throw error;
      } finally {
        ui.loading.hidden = true;
      }
    }

    function renderModel(model) {
      const snapshot = model.snapshot;
      if (!snapshot) {
        renderBlocked(model.nextAction);
        return;
      }
      ui.ready.hidden = false;
      ui.blocked.hidden = true;
      ui.title.textContent = model.project.title;
      document.title = `${model.project.title} — YarnAI`;
      ui.garment.textContent = model.project.garmentType;
      ui.recipient.textContent = recipientLabel(model.project.recipient);
      ui.size.textContent = sizeLabel(model.project);
      ui.readiness.textContent = model.nextAction.status === "pending" ? "Шаг подготовлен" : model.nextAction.status === "ready" ? "Готово к работе" : model.nextAction.status === "stale" ? "Нужно обновить сведения" : "Нужна проверка";
      ui.readiness.dataset.status = model.nextAction.status;
      const detailsHref = workspace.projectRoute("/user-workspace-entry", projectId, "project-details");
      ui.detailsLink.href = detailsHref;
      ui.confirmedDetailsLink.href = detailsHref;
      ui.nextTitle.textContent = model.nextAction.title;
      ui.nextCopy.textContent = model.nextAction.description;
      ui.primaryAction.textContent = actionLabel(model.nextAction.action);
      ui.primaryAction.disabled = busy || !model.nextAction.destination;
      ui.primaryAction.hidden = !model.nextAction.destination;
      ui.productTitle.textContent = model.project.garmentType;
      ui.productDescription.textContent = `${model.project.title}. Подтверждённая основа проекта готова.`;
      ui.productSize.textContent = sizeLabel(model.project);
      ui.productFit.textContent = fitLabel(model.project.fit);
      ui.productSource.textContent = sourceLabel(model.materials);
      renderConfirmed(snapshot);
      renderMaterials(model).catch(() => setMaterialStatus("Не удалось прочитать один из сохранённых файлов. Его можно добавить заново.", "error"));
    }

    function renderBlocked(action) {
      ui.ready.hidden = true;
      ui.blocked.hidden = false;
      ui.blocked.dataset.reasonCodes = (action.reasons || []).map((reason) => reason.code || reason).join(",");
      ui.blockedTitle.textContent = action.title;
      ui.blockedCopy.textContent = action.description;
      ui.reviewLink.href = action.destination || "/#saved-projects";
      ui.blocked.querySelector(".flow-eyebrow").textContent = action.status === "ready" ? "Сохранённый проект" : "Нужна проверка";
      ui.reviewLink.textContent = action.action === "review-details"
        ? "Проверить сведения"
        : action.action === "continue-pattern-execution"
          ? "Открыть план вязания"
          : action.status === "ready" ? "Продолжить проект" : "Вернуться в мастерскую";
    }

    function renderMissing() {
      ui.loading.hidden = true;
      ui.ready.hidden = true;
      ui.blocked.hidden = true;
      ui.missing.hidden = false;
      document.title = "Проект не найден — YarnAI";
    }

    function renderConfirmed(snapshot) {
      const facts = [
        ["Изделие", snapshot.garment.type],
        ["Размер", snapshot.garment.sizeMode === "standard" ? snapshot.garment.standardSize : "Индивидуальные мерки"],
        ["Получатель", recipientLabel(snapshot.garment.recipient)],
        ["Посадка", fitLabel(snapshot.garment.fit)],
        ...measurementFacts(snapshot.measurements),
      ];
      ui.confirmedFacts.replaceChildren(...facts.map(([label, value]) => {
        const row = document.createElement("div");
        const term = document.createElement("dt");
        const description = document.createElement("dd");
        term.textContent = label;
        description.textContent = value || "Не указано";
        row.append(term, description);
        return row;
      }));
      renderIssueList(ui.assumptions, ui.assumptionsEmpty, snapshot.assumptions, (item) => item.label || item.message);
      renderIssueList(ui.warnings, ui.warningsEmpty, snapshot.warnings, (item) => item.message || item.label);
    }

    function renderIssueList(list, empty, values, label) {
      const items = Array.isArray(values) ? values : [];
      empty.hidden = items.length > 0;
      list.replaceChildren(...items.map((item) => {
        const row = document.createElement("li");
        row.textContent = label(item) || "Подробность не указана";
        return row;
      }));
    }

    async function renderMaterials(model) {
      previews.revokeAll();
      ui.productImage.hidden = true;
      ui.productImage.removeAttribute("src");
      ui.productPlaceholder.hidden = false;
      ui.materialsCount.textContent = String(model.materials.length);
      ui.materialsEmpty.hidden = model.materials.length > 0;
      const rows = model.materials.map(materialRow);
      ui.materialsList.replaceChildren(...rows.map((entry) => entry.element));
      await Promise.all(rows.map(async ({ material, element, action }) => {
        if (!material.preview || material.availability !== "available") return;
        try {
          const stored = material.reference.storage === "photo"
            ? await repository.getPhoto(projectId, material.reference.id)
            : await repository.getPatternFile(projectId, material.reference.materialId);
          if (!stored?.blob) throw new Error("BLOB_MISSING");
          const previewUrl = previews.create(stored.blob);
          if (!previewUrl) throw new Error("PREVIEW_UNAVAILABLE");
          action.href = previewUrl;
          action.hidden = false;
          if (model.mainMaterial?.id === material.id) {
            ui.productImage.src = previewUrl;
            ui.productImage.alt = `Главное изображение проекта «${model.project.title}»`;
            ui.productImage.hidden = false;
            ui.productPlaceholder.hidden = true;
          }
        } catch {
          element.dataset.availability = "broken";
          action.removeAttribute("href");
          action.hidden = true;
          element.querySelector(".project-workspace-material-meta").textContent = `${material.typeLabel} · Файл недоступен`;
        }
      }));
    }

    async function inspectMaterialReferences(materials) {
      for (const material of materials) {
        if (material.availability === "broken") return "broken";
        if (material.availability !== "available" || !material.reference) continue;
        try {
          const stored = material.reference.storage === "photo"
            ? await repository.getPhoto(projectId, material.reference.id)
            : await repository.getPatternFile(projectId, material.reference.materialId);
          if (!(stored?.blob instanceof Blob)) return "broken";
        } catch {
          return "broken";
        }
      }
      return "ready";
    }

    function materialRow(material) {
      const element = document.createElement("li");
      element.className = "project-workspace-material-item";
      element.dataset.availability = material.availability;
      const icon = document.createElement("span");
      icon.className = "project-workspace-material-icon";
      icon.setAttribute("aria-hidden", "true");
      icon.textContent = ({ photo: "Фото", diagram: "Схема", pdf: "PDF", text: "TXT", unsupported: "Файл" })[material.kind];
      const copy = document.createElement("div");
      const name = document.createElement("div");
      name.className = "project-workspace-material-name";
      name.textContent = material.name;
      const meta = document.createElement("p");
      meta.className = "project-workspace-material-meta";
      meta.textContent = `${material.typeLabel} · ${material.availabilityLabel} · ${material.source}`;
      copy.append(name, meta);
      const action = document.createElement("a");
      action.textContent = "Открыть";
      action.target = "_blank";
      action.rel = "noopener";
      action.hidden = true;
      element.append(icon, copy, action);
      return { material, element, action };
    }

    async function saveSelectedMaterial() {
      const file = ui.materialInput.files?.[0];
      if (!file || busy) return;
      setBusy(true);
      setMaterialStatus("Сохраняем материал…", "");
      try {
        const kind = workspace.materialKind(file);
        if (kind === "unsupported") throw new Error("UNSUPPORTED_MATERIAL");
        if (kind === "photo") {
          await repository.addPhoto(projectId, file, {
            purpose: ui.materialPurpose.value,
            display_name: file.name || (ui.materialPurpose.value === "PATTERN_REFERENCE" ? "Схема" : "Фотография изделия"),
          });
        } else {
          const materialId = await materialIdentity(file);
          await repository.savePatternFile(projectId, materialId, file, {
            displayName: file.name || "Материал проекта",
            mediaType: file.type || "application/octet-stream",
          });
        }
        ui.materialInput.value = "";
        await refresh({ preserveStatus: true });
        setMaterialStatus("Материал сохранён в проекте.", "success", true);
      } catch (error) {
        const message = error?.code === "PHOTO_TOO_LARGE" || error?.code === "INVALID_PATTERN_FILE"
          ? error.userMessage
          : error?.message === "UNSUPPORTED_MATERIAL"
            ? "Этот формат пока не поддерживается. Добавьте изображение, PDF или текстовый файл."
            : error?.userMessage || "Не удалось сохранить материал. Попробуйте ещё раз.";
        setMaterialStatus(message, "error", true);
      } finally {
        setBusy(false);
      }
    }

    async function saveDescription(event) {
      event.preventDefault();
      const value = ui.description.value.trim();
      if (!value || busy) {
        if (!value) setMaterialStatus("Добавьте короткое описание изделия.", "error", true);
        return;
      }
      setBusy(true);
      setMaterialStatus("Сохраняем описание…", "");
      try {
        const blob = new Blob([value], { type: "text/plain" });
        const materialId = await materialIdentity(blob);
        await repository.savePatternFile(projectId, materialId, blob, {
          displayName: "Описание проекта.txt",
          mediaType: "text/plain",
        });
        ui.description.value = "";
        await refresh({ preserveStatus: true });
        setMaterialStatus("Описание сохранено в проекте.", "success", true);
      } catch (error) {
        setMaterialStatus(error?.userMessage || "Не удалось сохранить описание.", "error", true);
      } finally {
        setBusy(false);
      }
    }

    async function materialIdentity(blob) {
      const bytes = await blob.arrayBuffer();
      const digest = await globalObject.crypto.subtle.digest("SHA-256", bytes);
      const hash = [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
      return `workspace-${hash}`;
    }

    async function followPrimaryAction() {
      if (busy) return;
      setBusy(true);
      ui.actionStatus.textContent = "Повторно проверяем проект…";
      try {
        await refresh({ preserveStatus: true });
        const action = currentModel?.nextAction;
        if (!action?.destination || !allowedDestination(action.destination)) throw new Error("INVALID_DESTINATION");
        const destination = action.action === "start-swatch"
          ? workspace.projectRoute("/swatch-assistant", projectId)
          : action.destination;
        if (!allowedDestination(destination)) throw new Error("INVALID_DESTINATION");
        ui.actionStatus.textContent = "Проект проверен. Открываем следующий шаг…";
        globalObject.location.assign(destination);
      } catch (error) {
        ui.actionStatus.textContent = error?.message === "INVALID_DESTINATION"
          ? "Безопасный переход недоступен. Вернитесь к подтверждённым сведениям."
          : error?.userMessage || "Проект изменился. Проверьте сведения ещё раз.";
        ui.actionStatus.focus();
      } finally {
        setBusy(false);
      }
    }

    function allowedDestination(value) {
      try {
        const destination = new URL(value, globalObject.location.origin);
        const allowedPaths = new Set(["/user-workspace-entry", "/swatch-assistant", ...Object.values(workspace.WORKSPACE_ACTION_ROUTES)]);
        return destination.origin === globalObject.location.origin &&
          allowedPaths.has(destination.pathname) &&
          destination.searchParams.get("project") === projectId;
      } catch {
        return false;
      }
    }

    function continueFromSwatch() {
      globalObject.setTimeout(() => {
        const feedback = document.querySelector("#swatch-feedback");
        const calculatorLink = document.querySelector("#open-calculator-link");
        if (!feedback?.hidden || !calculatorLink || calculatorLink.hidden) return;
        try {
          const href = workspace.projectRoute("/project-calculation-entry", projectId);
          const destination = new URL(href, globalObject.location.origin);
          if (destination.origin !== globalObject.location.origin || destination.pathname !== "/project-calculation-entry") return;
          calculatorLink.href = href;
          globalObject.location.assign(href);
        } catch {
          ui.actionStatus.textContent = "Не удалось безопасно открыть расчёт. Вернитесь в рабочее пространство.";
        }
      }, 0);
    }

    function activateSwatchRoute() {
      if (globalObject.location.hash !== "#swatch-assistant") return;
      const resultScreen = document.querySelector("#result-screen");
      const swatch = document.querySelector("#swatch-assistant");
      if (!resultScreen || !swatch) return;
      document.body.classList.remove("is-project-workspace");
      document.body.classList.add("is-project-swatch");
      resultScreen.hidden = false;
      swatch.hidden = false;
      swatch.scrollIntoView({ block: "start" });
      swatch.querySelector("h2, input, button")?.focus?.();
    }

    function setBusy(value) {
      busy = value;
      ui.primaryAction.disabled = value || !currentModel?.nextAction?.destination;
      ui.materialInput.disabled = value;
      ui.materialPurpose.disabled = value;
      ui.description.disabled = value;
      ui.descriptionSubmit.disabled = value;
    }

    function setMaterialStatus(message, state, focus = false) {
      ui.materialStatus.textContent = message;
      ui.materialStatus.dataset.state = state;
      if (focus) ui.materialStatus.focus();
    }

    function renderFatal(error) {
      ui.loading.hidden = true;
      if (error?.code === "PROJECT_NOT_FOUND" || error?.code === "INVALID_PROJECT_ID") {
        renderMissing();
        return;
      }
      renderBlocked({
        title: "Не удалось открыть рабочее пространство",
        description: error?.userMessage || "Локальное хранилище недоступно. Обновите страницу или вернитесь в мастерскую.",
        destination: projectId ? workspace?.projectRoute("/user-workspace-entry", projectId, "project-details") : "/#saved-projects",
        action: projectId ? "review-details" : "workshop",
      });
    }

    function cleanup() {
      previews?.revokeAll();
      repository?.close().catch(() => undefined);
    }

    function hasConfirmedGauge(intent) {
      return intent?.gaugeKnown === true && Number(intent?.gauge?.stitches) > 0 && Number(intent?.gauge?.widthCm) > 0;
    }

    function recipientLabel(value) {
      return ({ woman: "Для женщины", man: "Для мужчины", child: "Для ребёнка", self: "Для себя", neutral: "Без привязки к полу", other: "Другой получатель" })[value] || "Получатель подтверждён";
    }

    function fitLabel(value) {
      return ({ fitted: "По фигуре", regular: "Обычная", relaxed: "Свободная", oversized: "Оверсайз" })[value] || "Посадка подтверждена";
    }

    function sizeLabel(project) {
      return project.sizeMode === "standard" ? project.standardSize || "Стандартный размер" : "Индивидуальные мерки";
    }

    function actionLabel(action) {
      if (action === "open-calculation") return "\u041e\u0442\u043a\u0440\u044b\u0442\u044c \u043d\u0430\u0447\u0430\u043b\u044c\u043d\u044b\u0439 \u0440\u0430\u0441\u0447\u0451\u0442";
      if (action === "open-plan") return "\u041e\u0442\u043a\u0440\u044b\u0442\u044c \u043f\u043b\u0430\u043d \u0440\u0430\u0431\u043e\u0442\u044b";
      return ({ "start-swatch": "Начать с образца", "open-calculator": "Перейти к расчёту", "continue-project": "Продолжить вязание", "open-foundation-measurement": "Открыть измерение", "continue-foundation-execution": "Продолжить вязать резинку", "start-primary-fabric-execution": "Начать основное полотно", "open-primary-fabric-execution": "Вернуться к основному полотну", "review-primary-fabric-execution": "Проверить выполнение", "review-foundation-measurement": "Проверить измерение", "review-details": "Проверить сведения", "repair-materials": "Исправить материалы" })[action] || "Открыть следующий шаг";
    }

    function sourceLabel(materials) {
      if (!materials.length) return "Материалы пока не добавлены";
      const labels = [...new Set(materials.map((item) => item.typeLabel))];
      return labels.join(", ");
    }

    function measurementFacts(measurements) {
      const labels = {
        bust: "Обхват груди",
        waist: "Обхват талии",
        hips: "Обхват бёдер",
        shoulderWidth: "Ширина плеч",
        upperArm: "Обхват плеча",
        armholeDepth: "Глубина проймы",
        neck: "Обхват шеи",
        head: "Обхват головы",
        footLength: "Длина стопы",
        hand: "Обхват кисти",
        garmentWidth: "Ширина изделия",
        garmentLength: "Длина изделия",
        sleeveLength: "Длина рукава",
        necklineDepth: "Глубина горловины",
      };
      const values = [];
      for (const group of [measurements?.body, measurements?.garment]) {
        Object.entries(group || {}).forEach(([key, measurement]) => {
          values.push([labels[key] || "Мерка", `${measurement.value} ${measurement.unit === "inch" ? "дюйм." : "см"}`]);
        });
      }
      return values.slice(0, 6);
    }
  }
})(typeof window !== "undefined" ? window : globalThis);
