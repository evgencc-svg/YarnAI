"use strict";

(function initializeMaterialIntakeAssistant(globalObject) {
  if (typeof document === "undefined") {
    return;
  }

  const projectSystem = globalObject.YarnAIProjectSystem;
  const patternImport = globalObject.YarnAIPatternImport;
  const garmentReference = globalObject.YarnAIGarmentReferenceAnalysis;
  const experience = globalObject.YarnAIMaterialIntakeExperience;
  const select = (value) => document.querySelector(value);
  const ui = {
    workflow: select("#pattern-import-workflow"),
    pageTitle: select("#page-title"),
    lead: select("#material-intake-lead"),
    support: select("#material-intake-support"),
    missing: select("#pattern-import-error"),
    missingMessage: select("#pattern-import-error-message"),
    projectTitle: select("#pattern-import-project-title"),
    form: select("#material-intake-form"),
    dropZone: select("#material-intake-drop-zone"),
    input: select("#pattern-import-input"),
    materialsPanel: select("#pattern-import-materials-panel"),
    materials: select("#pattern-import-materials"),
    emptyMaterials: select("#material-intake-empty"),
    count: select("#pattern-import-count"),
    description: select("#material-intake-description"),
    formError: select("#pattern-import-form-error"),
    summaryTitle: select("#material-intake-summary-title"),
    summaryMessage: select("#material-intake-summary-message"),
    received: select("#material-intake-received"),
    continueButton: select("#pattern-import-continue"),
    submitLabel: select("#material-intake-submit-label"),
    confirm: select("#pattern-import-confirm"),
    corrupted: select("#pattern-import-corrupted"),
    blocked: select("#pattern-import-blocked"),
    blockedMessage: select("#pattern-import-blocked-message"),
    completed: select("#pattern-import-completed"),
    status: select("#pattern-import-status-message"),
  };

  let repository = null;
  let projectId = null;
  let project = null;
  let aggregate = null;
  let importResult = null;
  let garmentResult = null;
  let workflowIntent = "pattern_source";
  let persistedDescription = "";
  let purposes = {};
  let busy = false;
  const previewUrls = new Map();

  bindEvents();
  initialize().catch(() => showMissing("Проект не найден"));

  async function initialize() {
    if (!projectSystem || !patternImport || !experience || !garmentReference) {
      showMissing("Не удалось открыть материалы проекта.");
      return;
    }
    projectId = new URLSearchParams(globalObject.location.search).get("project");
    if (!projectId || !projectSystem.isUuidv7(projectId)) {
      showMissing("Проект не найден");
      return;
    }
    repository = new projectSystem.ProjectRepository();
    await repository.initialize();
    try {
      aggregate = await repository.getProject(projectId);
    } catch {
      showMissing("Проект не найден");
      return;
    }
    project = aggregate.project;
    workflowIntent = project?.draft_input?.workflow_intent?.kind === "garment_reference"
      || new URLSearchParams(globalObject.location.search).get("intent") === "garment_reference"
      ? "garment_reference"
      : "pattern_source";
    if (isGarmentFlow()) {
      garmentResult = await garmentReference.ensureForProject(repository, projectId);
      aggregate = garmentResult.aggregate;
      project = garmentResult.project;
    }
    readDraft();
    importResult = isGarmentFlow()
      ? emptyImportResult()
      : aggregate.project.active_calculation_id
        ? patternImport.inspectAggregate(aggregate)
        : emptyImportResult();
    if (importResult.state === "corrupted") {
      showCorrupted();
      return;
    }
    if (importResult.state === "blocked") {
      showBlocked();
      return;
    }
    ui.description.value = persistedDescription;
    ui.input.accept = isGarmentFlow()
      ? "image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp"
      : "application/pdf,image/*,text/plain,text/markdown,.pdf,.txt,.md";
    ui.projectTitle.textContent = project.title || "Новый проект";
    ui.workflow.hidden = false;
    ui.missing.hidden = true;
    await hydratePersistedPreviews();
    render();
  }

  function bindEvents() {
    ui.input.addEventListener("change", () => {
      const files = [...(ui.input.files || [])];
      ui.input.value = "";
      if (files.length) {
        addFiles(files);
      }
    });
    ui.dropZone.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        ui.input.click();
      }
    });
    ui.dropZone.addEventListener("dragenter", showDragState);
    ui.dropZone.addEventListener("dragover", showDragState);
    ui.dropZone.addEventListener("dragleave", hideDragState);
    ui.dropZone.addEventListener("drop", (event) => {
      event.preventDefault();
      hideDragState();
      const files = [...(event.dataTransfer?.files || [])];
      if (files.length) {
        addFiles(files);
      }
    });
    ui.description.addEventListener("input", renderSummary);
    ui.form.addEventListener("submit", submitMaterials);
    globalObject.addEventListener("beforeunload", releaseAllPreviews);
  }

  function showDragState(event) {
    event.preventDefault();
    ui.dropZone.classList.add("is-dragging");
    ui.dropZone.dataset.dragState = "Файлы можно отпустить";
  }

  function hideDragState() {
    ui.dropZone.classList.remove("is-dragging");
    delete ui.dropZone.dataset.dragState;
  }

  async function addFiles(files) {
    if (busy) {
      return;
    }
    clearError();
    const existing = materialModels();
    const accepted = [];
    const errors = [];
    files.forEach((file, index) => {
      const normalized = experience.normalizeFileMetadata(file, existing.length + index);
      if (!normalized.valid) {
        errors.push(normalized.validationMessage);
        return;
      }
      if (isGarmentFlow() && normalized.kind !== "image") {
        errors.push("Для этого пути добавь фотографию изделия в JPEG, PNG или WebP.");
        return;
      }
      if (experience.isDuplicate(normalized, [...existing, ...accepted])) {
        errors.push(experience.validationMessage("DUPLICATE", normalized.name));
        return;
      }
      accepted.push({ file, normalized });
    });
    if (!accepted.length) {
      showError(errors[0] || "Этот формат пока не поддерживается.");
      return;
    }
    await runMutation(async () => {
      if (isGarmentFlow()) {
        garmentResult = await garmentReference.addPhotosForProject(
          repository,
          projectId,
          accepted.map((entry) => entry.file),
        );
        await hydratePersistedPreviews();
        render();
        if (errors.length) showError(errors.join(" "));
        return;
      }
      await ensureImportFlow();
      const beforeIds = new Set(importState().materials.map((entry) => entry.id));
      importResult = await patternImport.addMaterialsForProject(
        repository,
        projectId,
        accepted.map((entry) => entry.file),
      );
      const added = importState().materials.filter((entry) => !beforeIds.has(entry.id));
      added.forEach((material, index) => {
        purposes[material.id] = material.type === "image" ? "unknown" : null;
        const source = accepted[index];
        if (source?.normalized.kind === "image" && globalObject.URL?.createObjectURL) {
          previewUrls.set(material.id, globalObject.URL.createObjectURL(source.file));
        }
      });
      await saveDraft({ purposes });
      render();
      if (errors.length) {
        showError(errors.join(" "));
      }
    }, "Не удалось сохранить материалы.");
  }

  async function ensureImportFlow() {
    aggregate = await repository.getProject(projectId);
    project = aggregate.project;
    if (!project.active_calculation_id) {
      const created = await repository.addCalculation(
        projectId,
        {
          workflow_kind: "material_intake",
          version: 1,
          source: "user_materials",
        },
        {
          status: "READY",
          normalized_inputs: { source: "user_materials" },
          axes: {},
          warnings: [],
          errors: [],
          clarifications: [],
          canon_version: "material-intake-1",
          specification_version: "material-intake-1",
        },
        { engine_version: "material-intake-1" },
      );
      project = created.project;
      aggregate = await repository.getProject(projectId);
    }
    importResult = await patternImport.ensureForProject(repository, projectId);
    project = importResult.project;
  }

  async function submitMaterials(event) {
    event.preventDefault();
    if (busy) {
      return;
    }
    clearError();
    const description = ui.description.value.trim();
    const readiness = experience.computeReadiness({
      materials: materialModels(),
      description,
    });
    if (!readiness.ready) {
      showError(experience.validationMessage("SOURCE_REQUIRED"));
      ui.dropZone.focus();
      return;
    }
    await runMutation(async () => {
      if (isGarmentFlow()) {
        if (description) {
          garmentResult = await garmentReference.recordClarificationForProject(
            repository,
            projectId,
            { type: "desired_change", text: description },
          );
        }
        garmentResult = await garmentReference.markProviderDisabledForProject(
          repository,
          projectId,
          { provider: "openai", model: "gpt-5.6-terra", enabled: false },
        );
        globalObject.location.assign(
          `/garment-reference-analysis?project=${encodeURIComponent(projectId)}`,
        );
        return;
      }
      await ensureImportFlow();
      await saveDraft({ description, purposes });
      const hasDescriptionMaterial = importState().materials.some(
        (entry) => entry.type === "text" && entry.displayName === "Описание проекта.txt",
      );
      if (description && !hasDescriptionMaterial) {
        const descriptionFile = new File(
          [description],
          "Описание проекта.txt",
          { type: "text/plain" },
        );
        importResult = await patternImport.addMaterialsForProject(
          repository,
          projectId,
          [descriptionFile],
        );
        const added = importState().materials.at(-1);
        purposes[added.id] = null;
        await saveDraft({ description, purposes });
      }
      ui.submitLabel.textContent = "Сохраняем материалы…";
      importResult = await patternImport.completeForProject(
        repository,
        projectId,
        true,
      );
      globalObject.location.assign(
        `/pattern-analysis?project=${encodeURIComponent(projectId)}`,
      );
    }, "Не удалось сохранить материалы.");
  }

  async function removeMaterial(material) {
    if (busy) {
      return;
    }
    const row = document.querySelector(
      `[data-material-id="${escapeSelector(material.id)}"]`,
    );
    await runMutation(async () => {
      if (isGarmentFlow()) {
        garmentResult = await garmentReference.removePhotoForProject(
          repository,
          projectId,
          material.id,
        );
        releasePreview(material.id);
        render();
        return;
      }
      importResult = await patternImport.removeMaterialForProject(
        repository,
        projectId,
        material.id,
      );
      releasePreview(material.id);
      delete purposes[material.id];
      await saveDraft({ purposes });
      render();
      const next = row?.nextElementSibling || row?.previousElementSibling;
      next?.querySelector("button, select")?.focus();
      if (!next) {
        ui.dropZone.focus();
      }
    }, "Не удалось удалить материал.");
  }

  async function updatePurpose(material, value) {
    if (isGarmentFlow()) return;
    const purpose = experience.normalizePurpose(value);
    purposes[material.id] = purpose;
    await runMutation(async () => {
      await saveDraft({ purposes });
      renderSummary();
    }, "Не удалось сохранить назначение материала.");
  }

  async function saveDraft(patch = {}) {
    const source = isRecord(project?.draft_input) ? project.draft_input : {};
    const previous = isRecord(source.material_intake) ? source.material_intake : {};
    const nextIntake = {
      version: 1,
      description: Object.hasOwn(patch, "description")
        ? String(patch.description || "")
        : String(previous.description || persistedDescription || ""),
      purposes: Object.hasOwn(patch, "purposes")
        ? { ...patch.purposes }
        : { ...purposes },
    };
    project = await repository.updateProject(projectId, {
      draft_input: {
        ...source,
        material_intake: nextIntake,
      },
      has_unfinished_calculation: true,
    });
    persistedDescription = nextIntake.description;
    purposes = { ...nextIntake.purposes };
  }

  function readDraft() {
    if (isGarmentFlow()) {
      const saved = garmentResult?.state?.clarifications || [];
      persistedDescription = saved.filter((entry) => entry.type === "desired_change").at(-1)?.text || "";
      purposes = {};
      return;
    }
    const draft = isRecord(project?.draft_input?.material_intake)
      ? project.draft_input.material_intake
      : {};
    persistedDescription =
      typeof draft.description === "string" ? draft.description : "";
    purposes = isRecord(draft.purposes) ? { ...draft.purposes } : {};
  }

  function render() {
    ui.workflow.hidden = false;
    ui.form.hidden = false;
    ui.pageTitle.textContent = isGarmentFlow() ? "Покажи готовую вещь" : "Что у тебя есть?";
    ui.lead.textContent = isGarmentFlow()
      ? "Добавь одну или несколько фотографий изделия с разных сторон."
      : "Добавь фото, схему, PDF или описание вещи. Можно выбрать несколько источников.";
    ui.support.textContent = isGarmentFlow()
      ? "YarnAI отделит видимое от предположений и неизвестного, а затем предложит собственную технологию похожего результата."
      : "YarnAI сначала разберёт материалы, а затем задаст только необходимые вопросы.";
    ui.description.placeholder = isGarmentFlow()
      ? "Например: сзади закрытое, карман не нужен, хочу более свободную посадку"
      : "Например: хочу такой же свитер, но длиннее и без высокого воротника";
    ui.submitLabel.textContent = isGarmentFlow() ? "Сохранить фото и проверить анализ" : "Проверить материалы";
    ui.missing.hidden = true;
    ui.corrupted.hidden = true;
    ui.blocked.hidden = true;
    ui.completed.hidden = true;
    renderMaterials();
    renderSummary();
  }

  function renderMaterials() {
    const materials = currentMaterials();
    ui.materialsPanel.hidden = false;
    ui.emptyMaterials.hidden = materials.length > 0;
    ui.count.textContent = materials.length
      ? `${materials.length} ${materialWord(materials.length)}`
      : "Пока пусто";
    ui.materials.replaceChildren(...materials.map(materialCard));
  }

  function materialCard(material) {
    const item = document.createElement("li");
    item.className = "intake-material-card";
    item.dataset.materialId = material.id;

    const preview = document.createElement("div");
    preview.className = "intake-material-preview";
    const previewUrl = previewUrls.get(material.id);
    if (material.type === "image" && previewUrl) {
      const image = document.createElement("img");
      image.src = previewUrl;
      image.alt = "";
      image.addEventListener("error", () => {
        releasePreview(material.id);
        preview.replaceChildren(fileGlyph(material.type));
      }, { once: true });
      preview.append(image);
    } else {
      preview.append(fileGlyph(material.type));
    }

    const body = document.createElement("div");
    body.className = "intake-material-body";
    const heading = document.createElement("div");
    heading.className = "intake-material-heading";
    const kind = document.createElement("span");
    kind.className = "intake-kind";
    kind.textContent = material.type === "image"
      ? purposeShortLabel(purposes[material.id])
      : experience.humanReadableFileKind(material.type);
    const valid = document.createElement("span");
    valid.className = "intake-valid";
    valid.textContent = "Готово";
    heading.append(kind, valid);
    const name = document.createElement("p");
    name.className = "intake-material-name";
    name.textContent = material.displayName;
    name.title = material.displayName;
    const size = document.createElement("p");
    size.className = "intake-material-size";
    size.textContent = experience.formatFileSize(material.size);
    body.append(heading, name, size);

    if (material.type === "image" && !isGarmentFlow()) {
      const label = document.createElement("label");
      label.className = "intake-purpose-label";
      const labelText = document.createElement("span");
      labelText.textContent = "Что на изображении?";
      const purpose = document.createElement("select");
      purpose.className = "intake-purpose";
      purpose.setAttribute("aria-label", `Назначение файла «${material.displayName}»`);
      ["garment_photo", "chart", "unknown"].forEach((value) => {
        const option = document.createElement("option");
        option.value = value;
        option.textContent = experience.PURPOSE_LABELS[value];
        purpose.append(option);
      });
      purpose.value = experience.normalizePurpose(purposes[material.id]);
      purpose.addEventListener("change", () => updatePurpose(material, purpose.value));
      label.append(labelText, purpose);
      body.append(label);
    }

    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "intake-remove";
    remove.textContent = "Удалить";
    remove.setAttribute("aria-label", `Удалить файл «${material.displayName}»`);
    remove.addEventListener("click", () => removeMaterial(material));

    item.append(preview, body, remove);
    return item;
  }

  function renderSummary() {
    const summary = experience.buildSummary({
      materials: materialModels(),
      description: ui.description.value,
    });
    ui.summaryTitle.textContent = summary.title;
    ui.summaryMessage.textContent = summary.message;
    ui.received.textContent = summary.receivedLabel;
    ui.continueButton.disabled = busy || !summary.ready;
    ui.confirm.checked = summary.ready;
    ui.submitLabel.textContent = isGarmentFlow() ? "Сохранить фото и проверить анализ" : "Проверить материалы";
  }

  function materialModels() {
    return currentMaterials().map((entry, index) =>
      experience.normalizeFileMetadata({
        id: entry.id,
        displayName: entry.displayName,
        size: entry.size,
        kind: entry.type,
        purpose: purposes[entry.id],
        order: entry.order,
      }, index),
    );
  }

  function importState() {
    return importResult?.patternImport || { materials: [], status: "not_started" };
  }

  async function hydratePersistedPreviews() {
    if (!repository || !globalObject.URL?.createObjectURL) {
      return;
    }
    const images = currentMaterials().filter((entry) => entry.type === "image");
    for (const material of images) {
      try {
        if (previewUrls.has(material.id)) continue;
        const stored = isGarmentFlow()
          ? await repository.getPhoto(projectId, material.id)
          : await repository.getPatternFile(projectId, material.id);
        if (stored?.blob instanceof Blob && stored.blob.type.startsWith("image/")) {
          previewUrls.set(material.id, globalObject.URL.createObjectURL(stored.blob));
        }
      } catch {
        // Preview is optional; the file card remains usable.
      }
    }
  }

  async function runMutation(operation, fallback) {
    if (busy) {
      return;
    }
    busy = true;
    setBusy(true);
    clearError();
    try {
      await operation();
    } catch (error) {
      showError(userMessage(error, fallback));
    } finally {
      busy = false;
      setBusy(false);
      ui.submitLabel.textContent = isGarmentFlow() ? "Сохранить фото и проверить анализ" : "Проверить материалы";
      renderSummary();
    }
  }

  function setBusy(value) {
    ui.form.setAttribute("aria-busy", String(value));
    ui.form.querySelectorAll("button, select, input").forEach((control) => {
      control.disabled = value;
    });
    if (!value) {
      ui.input.disabled = false;
    }
  }

  function showError(message) {
    ui.formError.textContent = message;
    ui.status.textContent = message;
  }

  function clearError() {
    ui.formError.textContent = "";
    ui.status.textContent = "";
  }

  function showMissing(title) {
    ui.workflow.hidden = true;
    ui.pageTitle.textContent = title;
    ui.lead.textContent = "Вернись в мастерскую и начни новый проект.";
    ui.support.textContent = "";
    ui.missing.hidden = false;
    ui.missingMessage.textContent =
      "Вернись в мастерскую и начни новый проект.";
  }

  function showCorrupted() {
    ui.workflow.hidden = false;
    ui.form.hidden = true;
    ui.corrupted.hidden = false;
    ui.blocked.hidden = true;
    ui.completed.hidden = true;
    ui.status.textContent = "Не удалось прочитать сохранённые материалы.";
  }

  function showBlocked() {
    ui.workflow.hidden = false;
    ui.form.hidden = true;
    ui.blocked.hidden = false;
    ui.corrupted.hidden = true;
    ui.completed.hidden = true;
    ui.blockedMessage.textContent =
      importResult.blockers?.[0]?.message || "Материалы этого проекта пока недоступны.";
  }

  function userMessage(error, fallback) {
    const code = error?.code;
    if (code === "MATERIAL_TOO_LARGE") {
      return "Файл слишком большой.";
    }
    if (code === "MATERIAL_TYPE_UNSUPPORTED") {
      return "Этот формат пока не поддерживается.";
    }
    if (code === "PROJECT_NOT_FOUND" || code === "INVALID_PROJECT_ID") {
      return "Проект не найден.";
    }
    return error?.userMessage && !/DOMException|IndexedDB|object store/i.test(error.userMessage)
      ? error.userMessage
      : fallback;
  }

  function fileGlyph(type) {
    const glyph = document.createElement("span");
    glyph.className = "intake-file-glyph";
    glyph.setAttribute("aria-hidden", "true");
    glyph.textContent = type === "pdf" ? "PDF" : type === "text" ? "TXT" : "IMG";
    return glyph;
  }

  function purposeShortLabel(value) {
    return {
      garment_photo: "Фото вещи",
      chart: "Схема",
      unknown: "Изображение",
    }[experience.normalizePurpose(value)];
  }

  function materialWord(count) {
    const mod10 = count % 10;
    const mod100 = count % 100;
    if (mod10 === 1 && mod100 !== 11) {
      return "материал";
    }
    if ([2, 3, 4].includes(mod10) && ![12, 13, 14].includes(mod100)) {
      return "материала";
    }
    return "материалов";
  }

  function releasePreview(materialId) {
    const url = previewUrls.get(materialId);
    if (url) {
      globalObject.URL.revokeObjectURL(url);
      previewUrls.delete(materialId);
    }
  }

  function releaseAllPreviews() {
    [...previewUrls.keys()].forEach(releasePreview);
  }

  function escapeSelector(value) {
    return globalObject.CSS?.escape
      ? globalObject.CSS.escape(value)
      : String(value).replace(/["\\]/g, "\\$&");
  }

  function emptyImportResult() {
    return {
      state: "missing",
      project,
      patternImport: null,
      blockers: [],
    };
  }

  function isGarmentFlow() {
    return workflowIntent === "garment_reference";
  }

  function currentMaterials() {
    if (!isGarmentFlow()) return importState().materials;
    const metadata = new Map((garmentResult?.aggregate?.photos || []).map((photo) => [photo.photo_id, photo]));
    return (garmentResult?.state?.source?.referencePhotos || []).map((photo, index) => ({
      id: photo.photoId,
      displayName: photo.displayName,
      size: metadata.get(photo.photoId)?.byte_size || 1,
      type: "image",
      purpose: "garment_photo",
      order: index + 1,
    }));
  }

  function isRecord(value) {
    return Boolean(value) && typeof value === "object" && !Array.isArray(value);
  }
})(typeof window !== "undefined" ? window : globalThis);
