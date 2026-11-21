"use strict";

(function initializeSwatchWorkspace(globalObject) {
  if (typeof document === "undefined") return;
  const gauge = globalObject.YarnAISwatchGauge;
  const system = globalObject.YarnAIProjectSystem;
  const workspace = globalObject.YarnAIUserWorkspaceEntry;
  const initialization = globalObject.YarnAIProjectInitialization;
  const experience = globalObject.YarnAIProjectDetailsExperience;
  const readinessApi = globalObject.YarnAIProjectReadiness;
  const ui = {
    loading: document.querySelector("#loading-state"),
    blocked: document.querySelector("#blocked-state"),
    blockedTitle: document.querySelector("#blocked-title"),
    blockedMessage: document.querySelector("#blocked-message"),
    blockedAction: document.querySelector("#blocked-action"),
    ready: document.querySelector("#ready-state"),
    back: document.querySelector("#workspace-back"),
    form: document.querySelector("#gauge-form"),
    title: document.querySelector("#project-context-title"),
    garment: document.querySelector("#context-garment"),
    size: document.querySelector("#context-size"),
    recipient: document.querySelector("#context-recipient"),
    yarn: document.querySelector("#context-yarn"),
    tool: document.querySelector("#context-tool"),
    technique: document.querySelector("#context-technique"),
    productImageWrap: document.querySelector("#project-image-wrap"),
    productImage: document.querySelector("#project-image"),
    swatchStatus: document.querySelector("#swatch-status"),
    gaugeStatus: document.querySelector("#gauge-status"),
    unitLabels: document.querySelectorAll(".unit-label"),
    fields: {
      stitches: document.querySelector("#stitches"),
      rows: document.querySelector("#rows"),
      width: document.querySelector("#width"),
      height: document.querySelector("#height"),
    },
    fieldErrors: {
      stitches: document.querySelector("#stitches-error"),
      rows: document.querySelector("#rows-error"),
      width: document.querySelector("#width-error"),
      height: document.querySelector("#height-error"),
    },
    stitchResult: document.querySelector("#stitch-result"),
    rowResult: document.querySelector("#row-result"),
    errorSummary: document.querySelector("#error-summary"),
    errorList: document.querySelector("#error-list"),
    warningSummary: document.querySelector("#warning-summary"),
    warningList: document.querySelector("#warning-list"),
    assumptionSummary: document.querySelector("#assumption-summary"),
    assumptionList: document.querySelector("#assumption-list"),
    ackWrap: document.querySelector("#warning-ack-wrap"),
    ack: document.querySelector("#warning-ack"),
    confirm: document.querySelector("#confirm-gauge"),
    saveStatus: document.querySelector("#save-status"),
    photoInput: document.querySelector("#swatch-photo-input"),
    choosePhoto: document.querySelector("#choose-photo"),
    replacePhoto: document.querySelector("#replace-photo"),
    removePhoto: document.querySelector("#remove-photo"),
    photoEmpty: document.querySelector("#photo-empty"),
    photoWrap: document.querySelector("#photo-preview-wrap"),
    photo: document.querySelector("#photo-preview"),
    photoName: document.querySelector("#photo-name"),
    photoStatus: document.querySelector("#photo-status"),
    confirmedPanel: document.querySelector("#confirmed-panel"),
    confirmedSummary: document.querySelector("#confirmed-summary"),
    continueLink: document.querySelector("#continue-workspace"),
    historyPanel: document.querySelector("#history-panel"),
    historyList: document.querySelector("#history-list"),
  };
  let repository = null;
  let projectId = "";
  let aggregate = null;
  let source = null;
  let currentPhotoId = null;
  let currentPhotoName = "";
  let photoCorrupted = false;
  let photoUrl = "";
  let projectImageUrl = "";
  let busy = false;
  let saveTimer = null;
  let saveChain = Promise.resolve();
  let unitChangedAfterInput = false;
  let eventsBound = false;
  let hydratedAcknowledgedWarningCodes = null;

  start().catch(renderFatal);

  function waitForPageShow() {
    return new Promise((resolve) => globalObject.addEventListener("pageshow", resolve, { once: true }));
  }

  function waitForNativeFormRestoration() {
    const nextFrame = typeof globalObject.requestAnimationFrame === "function"
      ? (resolve) => globalObject.requestAnimationFrame(resolve)
      : (resolve) => globalObject.setTimeout(resolve, 0);
    return new Promise((resolve) => nextFrame(() => nextFrame(resolve)));
  }

  function bindEvents() {
    if (eventsBound) return;
    eventsBound = true;
    ui.form.addEventListener("submit", (event) => event.preventDefault());
    ui.form.addEventListener("input", handleInput);
    ui.form.addEventListener("change", handleChange);
    ui.ack.addEventListener("change", () => {
      renderAssessment();
      queueDraftSave();
    });
    ui.choosePhoto.addEventListener("click", () => ui.photoInput.click());
    ui.replacePhoto.addEventListener("click", () => ui.photoInput.click());
    ui.removePhoto.addEventListener("click", removePhoto);
    ui.photoInput.addEventListener("change", savePhoto);
    ui.confirm.addEventListener("click", confirmGauge);
    globalObject.addEventListener("pagehide", cleanup, { once: true });
  }

  async function start() {
    if (!gauge || !system || !workspace || !initialization || !experience || !readinessApi) {
      throw new Error("SWATCH_DEPENDENCY_MISSING");
    }
    await waitForPageShow();
    await waitForNativeFormRestoration();
    projectId = workspace.projectIdentityFromLocation(globalObject.location, system.isUuidv7);
    if (!projectId || globalObject.location.pathname !== "/swatch-assistant") {
      renderBlocked("Проект не найден", "Откройте помощник из рабочего пространства проекта.");
      return;
    }
    const workspaceHref = safeWorkspaceHref();
    ui.back.href = workspaceHref;
    ui.blockedAction.href = workspaceHref;
    ui.continueLink.href = workspaceHref;
    repository = new system.ProjectRepository();
    await repository.initialize();
    aggregate = await repository.getProject(projectId);
    source = buildVerifiedSource(aggregate);
    renderContext();
    await restoreProductImage();
    restoreHistoryAndDraft();
    renderAssessment();
    await waitForNativeFormRestoration();
    restoreHydratedAcknowledgement();
    renderAssessment();
    ui.loading.hidden = true;
    ui.ready.hidden = false;
    bindEvents();
    ui.fields.stitches.focus();
  }

  function safeWorkspaceHref() {
    const candidate = gauge.safeDestination(`/user-workspace-entry?project=${encodeURIComponent(projectId)}`, projectId);
    return candidate.valid ? candidate.href : "/";
  }

  function safeCalculationHref() {
    const value = `/project-calculation-entry?project=${encodeURIComponent(projectId)}`;
    try {
      const destination = new URL(value, globalObject.location.origin);
      return destination.origin === globalObject.location.origin
        && destination.pathname === "/project-calculation-entry"
        && destination.searchParams.get("project") === projectId
        ? `${destination.pathname}?project=${encodeURIComponent(projectId)}`
        : safeWorkspaceHref();
    } catch {
      return safeWorkspaceHref();
    }
  }

  function buildVerifiedSource(value) {
    if (!value?.project || value.project.project_id !== projectId) {
      throw userError("PROJECT_ID_MISMATCH", "Открыт другой проект. Работа остановлена.");
    }
    const context = experience.contextFromAggregate(value);
    if (!context.project || context.project.project_id !== projectId) {
      throw userError("PROJECT_ID_MISMATCH", "Связь с проектом повреждена.");
    }
    const draftIntent = context.project.draft_input?.project_intent || context.project.draft_input?.projectIntent || {};
    const effectiveIntent = experience.applyDetailsToIntent(context.intent, context.details);
    const initializationIntent = experience.applyDetailsToIntent(draftIntent, context.details);
    const readiness = readinessApi.evaluateProjectReadiness(initializationIntent);
    const safety = experience.progressSafety(context.relevantProgress);
    const destination = {
      enabled: true,
      href: `/swatch-assistant?project=${encodeURIComponent(projectId)}`,
      label: "Перейти к образцу",
      description: "Следующий шаг — образец и плотность.",
    };
    const input = {
      projectIdentity: projectId,
      closureHistory: context.closureHistory,
      initializationHistory: context.project.draft_input?.[initialization.HISTORY_KEY],
      nextDestination: destination,
      liveInput: {
        projectId,
        garmentType: initializationIntent.garmentType || "изделие",
        details: context.details,
        technology: context.technology,
        intent: initializationIntent,
        collaborationState: context.collaborationState,
        safe: safety.safe,
        nextDestination: destination,
      },
    };
    const assessment = initialization.assessInitialization(input);
    if (assessment.verdict !== "ready" || assessment.current !== true || assessment.canContinue !== true || !assessment.existing) {
      throw userError(assessment.reasons?.[0]?.code || "INITIALIZATION_BLOCKED", assessment.reasons?.[0]?.message || "Сначала подтвердите сведения проекта.");
    }
    const checked = initialization.validateInitializationRecord(assessment.existing, { projectIdentity: projectId });
    if (!checked.valid || !checked.trusted || checked.record.lifecycle !== "initialized") {
      throw userError("INITIALIZATION_UNTRUSTED", "Подтверждённая основа проекта не прошла проверку доверия.");
    }
    const record = checked.record;
    const snapshot = record.snapshot;
    return {
      context,
      effectiveIntent,
      initialization: record,
      domain: gauge.buildSourceSnapshot({
        projectIdentity: projectId,
        initializationIdentity: record.identity,
        initializationFingerprint: record.integrity.recordFingerprint || record.snapshot_fingerprint,
        yarn: textValue(effectiveIntent.yarn) || textValue(snapshot.materials?.yarn),
        tool: textValue(effectiveIntent.needles) || textValue(effectiveIntent.hook) || textValue(effectiveIntent.tool) || textValue(context.technology?.tool),
        technique: textValue(effectiveIntent.technique) || textValue(context.technology?.technique),
        pattern: textValue(effectiveIntent.mainPattern) || textValue(effectiveIntent.pattern) || textValue(context.technology?.pattern),
        recipient: textValue(snapshot.garment?.recipient),
        size: textValue(snapshot.garment?.standardSize) || textValue(snapshot.garment?.sizeMode),
      }),
    };
  }

  function userError(code, message) {
    const error = new Error(message);
    error.code = code;
    error.userMessage = message;
    return error;
  }

  function textValue(value) {
    if (typeof value === "string") return value.trim() || null;
    if (value && typeof value === "object") {
      const candidate = value.label || value.name || value.value || value.size || value.description;
      return typeof candidate === "string" || typeof candidate === "number" ? String(candidate) : null;
    }
    return typeof value === "number" ? String(value) : null;
  }

  function renderContext() {
    const garment = source.initialization.snapshot.garment || {};
    ui.title.textContent = aggregate.project.title || "Проект";
    ui.garment.textContent = garment.type || "Изделие";
    ui.size.textContent = garment.sizeMode === "standard" ? garment.standardSize || "Стандартный размер" : "Индивидуальные мерки";
    ui.recipient.textContent = recipientLabel(garment.recipient);
    ui.yarn.textContent = source.domain.yarn || "Не указана";
    ui.tool.textContent = source.domain.tool || "Не указан";
    ui.technique.textContent = source.domain.technique || "По проекту";
    document.title = `Плотность: ${aggregate.project.title || "проект"} — YarnAI`;
  }

  function recipientLabel(value) {
    return ({ woman: "Для женщины", man: "Для мужчины", child: "Для ребёнка", self: "Для себя", neutral: "Без привязки", other: "Другой получатель" })[value] || value || "Не указан";
  }

  async function restoreProductImage() {
    const photo = (aggregate.photos || []).find((item) => item.project_id === projectId && !item.deleted_at && item.status === "READY" && item.purpose !== "SWATCH");
    if (!photo) return;
    const stored = await repository.getPhoto(projectId, photo.photo_id);
    if (!stored?.blob) return;
    projectImageUrl = globalObject.URL.createObjectURL(stored.blob);
    ui.productImage.src = projectImageUrl;
    ui.productImage.alt = `Основное изображение проекта «${aggregate.project.title || "Проект"}»`;
    ui.productImageWrap.hidden = false;
  }

  function restoreHistoryAndDraft() {
    const draftInput = aggregate.project.draft_input || {};
    const current = gauge.selectCurrentRecord(draftInput[gauge.HISTORY_KEY], source.domain);
    if (current.state === "blocked") {
      throw userError(current.reasons[0]?.code || "GAUGE_HISTORY_INVALID", current.reasons[0]?.message || "История плотности повреждена.");
    }
    renderHistory(current.history, current);
    if (current.state === "current") showConfirmed(current.current);
    if (current.state === "stale") {
      ui.swatchStatus.textContent = "Нужно измерить заново";
      ui.gaugeStatus.textContent = "Предыдущая плотность устарела";
      ui.gaugeStatus.dataset.status = "stale";
      ui.saveStatus.textContent = current.reasons.map(issueText).join(" ");
    }
    const rawDraft = draftInput[gauge.DRAFT_KEY];
    if (!rawDraft) {
      hydratedAcknowledgedWarningCodes = null;
      ui.fields.width.value = "10";
      ui.fields.height.value = "10";
      return;
    }
    try {
      const draft = gauge.validateDraft(rawDraft, { projectIdentity: projectId });
      if (draft.sourceFingerprint !== gauge.sourceFingerprint(source.domain)) {
        hydratedAcknowledgedWarningCodes = null;
        ui.saveStatus.textContent = "Черновик относится к прежним параметрам проекта и не восстановлен.";
        ui.fields.width.value = "10";
        ui.fields.height.value = "10";
        return;
      }
      fillDraft(draft);
      if (draft.photoId) restorePhoto(draft.photoId).catch(markPhotoCorrupted);
      ui.saveStatus.textContent = "Черновик восстановлен.";
    } catch {
      hydratedAcknowledgedWarningCodes = null;
      ui.fields.width.value = "10";
      ui.fields.height.value = "10";
      ui.saveStatus.textContent = "Повреждённый черновик не использован. Подтверждённая история сохранена.";
    }
  }

  function fillDraft(draft) {
    const input = draft.measurementInput;
    ui.fields.stitches.value = input.stitches ?? "";
    ui.fields.rows.value = input.rows ?? "";
    ui.fields.width.value = input.width ?? "";
    ui.fields.height.value = input.height ?? "";
    const unit = ui.form.elements.namedItem("unit");
    if (unit?.value !== undefined) unit.value = input.unit || "cm";
    for (const [name, value] of Object.entries(draft.preparation)) {
      const fieldName = ({ sameYarn: "same-yarn", sameTools: "same-tools", samePattern: "same-pattern" })[name] || name;
      const control = ui.form.elements.namedItem(fieldName);
      if (control) control.checked = value === true;
    }
    hydratedAcknowledgedWarningCodes = [...draft.acknowledgedWarningCodes];
    restoreHydratedAcknowledgement();
    currentPhotoId = draft.photoId;
    renderUnitLabels(input.unit || "cm");
  }

  function restoreHydratedAcknowledgement() {
    if (!Array.isArray(hydratedAcknowledgedWarningCodes)) return;
    const assessment = gauge.assessMeasurement(readForm());
    const acknowledged = new Set(hydratedAcknowledgedWarningCodes);
    ui.ack.checked = assessment.requiredAcknowledgements.length > 0
      && assessment.requiredAcknowledgements.every((code) => acknowledged.has(code));
  }

  async function restorePhoto(photoId) {
    const stored = await repository.getPhoto(projectId, photoId);
    if (!stored?.metadata || !stored.blob || stored.metadata.purpose !== "SWATCH") throw new Error("BROKEN_SWATCH_PHOTO");
    revokePhotoUrl();
    currentPhotoId = stored.metadata.photo_id;
    currentPhotoName = stored.metadata.display_name || "Фотография образца";
    photoUrl = globalObject.URL.createObjectURL(stored.blob);
    ui.photo.src = photoUrl;
    ui.photoName.textContent = currentPhotoName;
    ui.photoWrap.hidden = false;
    ui.photoEmpty.hidden = true;
    photoCorrupted = false;
  }

  function markPhotoCorrupted() {
    photoCorrupted = true;
    ui.photoStatus.textContent = "Сохранённая фотография повреждена или отсутствует. Уберите её или добавьте заново.";
    renderAssessment();
  }

  function readForm() {
    const data = new FormData(ui.form);
    const preview = gauge.assessMeasurement({
      stitches: data.get("stitches"), rows: data.get("rows"),
      width: data.get("width"), height: data.get("height"), unit: data.get("unit"),
      preparation: {
        knitted: data.has("knitted"), washed: data.has("washed"), dry: data.has("dry"),
        unstretched: data.has("unstretched"), representative: data.has("representative"),
        sameYarn: data.has("same-yarn"), sameTools: data.has("same-tools"), samePattern: data.has("same-pattern"),
      },
      photoId: currentPhotoId,
    });
    const acknowledgedWarningCodes = ui.ack.checked ? preview.requiredAcknowledgements : [];
    return {
      stitches: data.get("stitches"), rows: data.get("rows"),
      width: data.get("width"), height: data.get("height"), unit: data.get("unit"),
      preparation: preview.preparation, photoId: currentPhotoId, acknowledgedWarningCodes,
    };
  }

  function renderAssessment() {
    const assessment = gauge.assessMeasurement(readForm());
    const errors = [...assessment.errors];
    if (photoCorrupted) errors.push({ code: "BROKEN_PHOTO_REFERENCE", field: "photo", message: "Повреждённую ссылку на фотографию нужно убрать или заменить." });
    for (const field of Object.keys(ui.fields)) {
      const item = errors.find((error) => error.field === field);
      ui.fields[field].setAttribute("aria-invalid", item ? "true" : "false");
      ui.fieldErrors[field].textContent = item ? issueText(item) : "";
    }
    renderIssues(ui.errorSummary, ui.errorList, errors);
    const warnings = [...assessment.warnings];
    if (unitChangedAfterInput) warnings.push({ code: "UNIT_CHANGED", message: "Единицы изменены; значения пересчитаны из канонических сантиметров." });
    renderIssues(ui.warningSummary, ui.warningList, warnings);
    renderIssues(ui.assumptionSummary, ui.assumptionList, assessment.assumptions);
    ui.ackWrap.hidden = assessment.requiredAcknowledgements.length === 0;
    if (assessment.requiredAcknowledgements.length === 0) ui.ack.checked = false;
    ui.stitchResult.textContent = assessment.computed ? formatNumber(assessment.computed.stitchesPer10Cm) : "—";
    ui.rowResult.textContent = assessment.computed ? formatNumber(assessment.computed.rowsPer10Cm) : "—";
    ui.confirm.disabled = busy || photoCorrupted || !assessment.canConfirm;
    ui.swatchStatus.textContent = assessment.readiness === "blocked" ? "Нужны данные" : assessment.readiness === "conditionally-ready" ? "Есть предупреждения" : "Готов к подтверждению";
    if (!ui.confirm.disabled) ui.gaugeStatus.textContent = "Результат рассчитан";
    return assessment;
  }

  function renderIssues(panel, list, values) {
    panel.hidden = values.length === 0;
    list.replaceChildren(...values.map((item) => {
      const row = document.createElement("li");
      row.textContent = issueText(item);
      return row;
    }));
  }

  function issueText(item) {
    const copy = {
      INVALID_UNIT: "Выберите сантиметры или дюймы.",
      INVALID_NUMBER: "Укажите числовое значение.",
      NON_POSITIVE_VALUE: "Значение должно быть больше нуля.",
      STITCHES_TOO_LARGE: "Количество петель слишком велико для одного участка.",
      ROWS_TOO_LARGE: "Количество рядов слишком велико для одного участка.",
      WIDTH_TOO_SMALL: "Ширина участка должна быть не меньше 0,5 см.",
      HEIGHT_TOO_SMALL: "Высота участка должна быть не меньше 0,5 см.",
      WIDTH_TOO_LARGE: "Ширина участка превышает 500 см.",
      HEIGHT_TOO_LARGE: "Высота участка превышает 500 см.",
      SWATCH_NOT_KNITTED: "Подтвердите, что образец связан.",
      SWATCH_STRETCHED: "Измерьте образец без растягивания.",
      YARN_MISMATCH: "Используйте выбранную для проекта пряжу.",
      TOOL_MISMATCH: "Используйте выбранные спицы или крючок.",
      PATTERN_MISMATCH: "Измерьте основной узор проекта.",
      SWATCH_NOT_WASHED: "Необработанный образец может изменить размер после стирки.",
      SWATCH_NOT_DRY: "Влажное полотно даёт ненадёжную плотность.",
      AREA_NOT_REPRESENTATIVE: "Для фактурного узора выберите репрезентативную область.",
      PHOTO_MISSING: "Фотография образца не добавлена.",
      SMALL_WIDTH: "Узкий участок может снизить точность.",
      SMALL_HEIGHT: "Низкий участок может снизить точность.",
      LOW_STITCH_COUNT: "Для надёжности лучше посчитать больше петель.",
      LOW_ROW_COUNT: "Для надёжности лучше посчитать больше рядов.",
      UNUSUALLY_LOW_STITCH_GAUGE: "Плотность петель необычно низкая. Перепроверьте замер.",
      UNUSUALLY_HIGH_STITCH_GAUGE: "Плотность петель необычно высокая. Перепроверьте замер.",
      UNUSUALLY_LOW_ROW_GAUGE: "Плотность рядов необычно низкая. Перепроверьте замер.",
      UNUSUALLY_HIGH_ROW_GAUGE: "Плотность рядов необычно высокая. Перепроверьте замер.",
      CANONICAL_CM: "Дюймы переведены по правилу 1 дюйм = 2,54 см.",
      PHOTO_MIME_UNSUPPORTED: "Добавьте JPEG, PNG или WebP.",
      PHOTO_SIZE_INVALID: "Размер фотографии должен быть от 1 байта до 20 МБ.",
      GAUGE_STALE: "Исходные данные проекта изменились; измерьте образец заново.",
    };
    const message = typeof item?.message === "string" && !item.message.includes("Swatch data is invalid")
      ? item.message
      : "";
    return copy[item?.code] || message || "Сохранённые данные не прошли проверку.";
  }

  function formatNumber(value) {
    return new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 2 }).format(value);
  }

  function handleInput() {
    renderAssessment();
    queueDraftSave();
  }

  function handleChange(event) {
    if (event.target?.name === "unit") convertUnit(event.target.value);
    renderAssessment();
    queueDraftSave();
  }

  function convertUnit(nextUnit) {
    const previousUnit = nextUnit === "cm" ? "in" : "cm";
    const hasDimensions = ui.fields.width.value || ui.fields.height.value;
    for (const field of ["width", "height"]) {
      const centimeters = gauge.toCentimeters(ui.fields[field].value, previousUnit);
      if (centimeters !== null) ui.fields[field].value = String(gauge.fromCentimeters(centimeters, nextUnit));
    }
    unitChangedAfterInput = Boolean(hasDimensions);
    renderUnitLabels(nextUnit);
  }

  function renderUnitLabels(value) {
    ui.unitLabels.forEach((element) => { element.textContent = value === "in" ? "дюйм." : "см"; });
  }

  function queueDraftSave(immediate = false) {
    globalObject.clearTimeout(saveTimer);
    saveTimer = globalObject.setTimeout(() => {
      saveChain = saveChain.catch(() => undefined).then(saveDraft);
    }, immediate ? 0 : 350);
  }

  async function saveDraft() {
    if (!repository || busy) return;
    ui.saveStatus.textContent = "Сохраняем черновик…";
    try {
      const latest = await repository.getProject(projectId);
      const latestSource = buildVerifiedSource(latest);
      if (gauge.sourceFingerprint(latestSource.domain) !== gauge.sourceFingerprint(source.domain)) {
        throw userError("SOURCE_CHANGED", "Параметры проекта изменились. Обновите страницу.");
      }
      const draft = gauge.buildDraft(readForm(), { source: source.domain, updatedAt: new Date().toISOString() });
      const draftInput = { ...(latest.project.draft_input || {}), [gauge.DRAFT_KEY]: draft };
      const project = await repository.updateProject(projectId, { draft_input: draftInput }, { baseRevision: latest.project.revision });
      aggregate = { ...latest, project };
      ui.saveStatus.textContent = "Черновик сохранён локально.";
    } catch (error) {
      ui.saveStatus.textContent = error.userMessage || "Не удалось сохранить черновик. Введённые данные остались на экране.";
      ui.saveStatus.focus();
    }
  }

  async function savePhoto() {
    const file = ui.photoInput.files?.[0];
    if (!file || busy) return;
    const validation = gauge.validatePhoto(file);
    if (!validation.valid) {
      ui.photoStatus.textContent = issueText(validation);
      ui.photoStatus.focus();
      ui.photoInput.value = "";
      return;
    }
    setBusy(true);
    ui.photoStatus.textContent = "Сохраняем фотографию…";
    const oldPhotoId = currentPhotoId;
    try {
      const metadata = await repository.addPhoto(projectId, file, { purpose: "SWATCH", display_name: file.name || "Контрольный образец" });
      currentPhotoId = metadata.photo_id;
      currentPhotoName = metadata.display_name;
      photoCorrupted = false;
      revokePhotoUrl();
      photoUrl = globalObject.URL.createObjectURL(file);
      ui.photo.src = photoUrl;
      ui.photoName.textContent = currentPhotoName;
      ui.photoWrap.hidden = false;
      ui.photoEmpty.hidden = true;
      ui.photoStatus.textContent = "Фотография сохранена локально.";
      if (oldPhotoId && oldPhotoId !== currentPhotoId && !photoReferencedByHistory(oldPhotoId)) {
        await repository.deletePhoto(projectId, oldPhotoId).catch(() => undefined);
      }
      queueDraftSave(true);
    } catch (error) {
      currentPhotoId = oldPhotoId;
      ui.photoStatus.textContent = error.userMessage || "Не удалось сохранить фотографию.";
      ui.photoStatus.focus();
    } finally {
      ui.photoInput.value = "";
      setBusy(false);
      renderAssessment();
    }
  }

  async function removePhoto() {
    if (busy || !currentPhotoId) return;
    const removedId = currentPhotoId;
    setBusy(true);
    try {
      if (!photoReferencedByHistory(removedId)) await repository.deletePhoto(projectId, removedId);
      currentPhotoId = null;
      currentPhotoName = "";
      photoCorrupted = false;
      revokePhotoUrl();
      ui.photo.removeAttribute("src");
      ui.photoWrap.hidden = true;
      ui.photoEmpty.hidden = false;
      ui.photoStatus.textContent = photoReferencedByHistory(removedId)
        ? "Фото убрано из нового замера; копия сохранена для истории."
        : "Фотография удалена.";
      queueDraftSave(true);
    } catch (error) {
      ui.photoStatus.textContent = error.userMessage || "Не удалось убрать фотографию.";
    } finally {
      setBusy(false);
      renderAssessment();
    }
  }

  function photoReferencedByHistory(photoId) {
    try {
      const history = gauge.normalizeHistory(aggregate.project.draft_input?.[gauge.HISTORY_KEY], { projectIdentity: projectId });
      return history.records.some((item) => item.snapshot.linkedPhotoIdentity === photoId);
    } catch {
      return true;
    }
  }

  async function confirmGauge() {
    if (busy) return;
    const assessment = renderAssessment();
    if (!assessment.canConfirm || photoCorrupted) {
      ui.errorSummary.hidden = false;
      ui.errorSummary.focus();
      return;
    }
    setBusy(true);
    ui.saveStatus.textContent = "Повторно проверяем проект…";
    try {
      await saveChain.catch(() => undefined);
      const latest = await repository.getProject(projectId);
      const latestSource = buildVerifiedSource(latest);
      if (gauge.sourceFingerprint(latestSource.domain) !== gauge.sourceFingerprint(source.domain)) {
        throw userError("SOURCE_CHANGED", "Параметры проекта изменились. Измерение не подтверждено.");
      }
      const input = readForm();
      const confirmedAt = new Date().toISOString();
      const record = gauge.buildConfirmedRecord(input, {
        source: latestSource.domain,
        identity: system.uuidv7(),
        confirmedAt,
        createdBy: "Владелец проекта",
      });
      const beforeHistory = gauge.normalizeHistory(latest.project.draft_input?.[gauge.HISTORY_KEY], { projectIdentity: projectId });
      const history = gauge.appendHistory(beforeHistory, record);
      const current = history.records.find((item) => item.confirmationKey === record.confirmationKey) || record;
      const oldIntent = latest.project.draft_input?.project_intent || latest.project.draft_input?.projectIntent || {};
      const legacyGauge = {
        stitches: current.snapshot.computed.stitchesPer10Cm,
        rows: current.snapshot.computed.rowsPer10Cm,
        widthCm: 10,
        heightCm: 10,
        sourceMeasurementCount: 1,
        raw: `${current.snapshot.computed.stitchesPer10Cm} петель и ${current.snapshot.computed.rowsPer10Cm} рядов на 10 см`,
      };
      const projectIntent = {
        ...oldIntent,
        sampleKnown: true,
        gaugeKnown: true,
        gauge: legacyGauge,
        fieldStatus: { ...(oldIntent.fieldStatus || {}), sampleKnown: "known", gaugeKnown: "known", gauge: "known" },
      };
      const draft = gauge.buildDraft(input, { source: latestSource.domain, updatedAt: confirmedAt });
      const draftInput = {
        ...(latest.project.draft_input || {}),
        project_intent: projectIntent,
        [gauge.HISTORY_KEY]: history,
        [gauge.DRAFT_KEY]: draft,
      };
      const project = await repository.updateProject(projectId, { draft_input: draftInput }, {
        baseRevision: latest.project.revision,
        timestamp: confirmedAt,
      });
      aggregate = { ...latest, project };
      source = latestSource;
      renderHistory(history, { state: "current", current });
      showConfirmed(current);
      ui.saveStatus.textContent = history.records.length === beforeHistory.records.length
        ? "Это измерение уже было подтверждено; дубликат не создан."
        : "Плотность подтверждена и сохранена локально.";
      ui.saveStatus.focus();
    } catch (error) {
      ui.saveStatus.textContent = error.userMessage || "Не удалось подтвердить плотность. Данные остались на экране.";
      ui.saveStatus.focus();
    } finally {
      setBusy(false);
      renderAssessment();
    }
  }

  function showConfirmed(record) {
    const result = record.snapshot.computed;
    ui.confirmedSummary.textContent = `${formatNumber(result.stitchesPer10Cm)} петель и ${formatNumber(result.rowsPer10Cm)} рядов на 10 см.`;
    ui.confirmedPanel.hidden = false;
    ui.gaugeStatus.textContent = "Плотность подтверждена";
    ui.gaugeStatus.dataset.status = "confirmed";
    ui.continueLink.href = safeCalculationHref();
    ui.continueLink.textContent = "\u041f\u0435\u0440\u0435\u0439\u0442\u0438 \u043a \u043d\u0430\u0447\u0430\u043b\u044c\u043d\u043e\u043c\u0443 \u0440\u0430\u0441\u0447\u0451\u0442\u0443";
  }

  function renderHistory(historySource, selection = null) {
    const history = gauge.normalizeHistory(historySource, { projectIdentity: projectId });
    ui.historyPanel.hidden = history.records.length === 0;
    ui.historyList.replaceChildren(...history.records.slice().reverse().map((item) => {
      const row = document.createElement("li");
      const result = item.snapshot.computed;
      const date = new Intl.DateTimeFormat("ru-RU", { dateStyle: "medium", timeStyle: "short" }).format(Date.parse(item.confirmedAt));
      const selectedKey = selection?.current?.confirmationKey
        || (selection?.state === "stale" ? history.records.at(-1)?.confirmationKey : "");
      const selected = item.confirmationKey === selectedKey;
      const label = selected && selection.state === "current"
        ? "\u0422\u0435\u043a\u0443\u0449\u0430\u044f \u0440\u0435\u0432\u0438\u0437\u0438\u044f: "
        : selected && selection.state === "stale"
          ? "\u0423\u0441\u0442\u0430\u0440\u0435\u0432\u0448\u0430\u044f \u0440\u0435\u0432\u0438\u0437\u0438\u044f: "
          : "\u0423\u0441\u0442\u0430\u0440\u0435\u0432\u0448\u0430\u044f \u0440\u0435\u0432\u0438\u0437\u0438\u044f: ";
      row.textContent = `${label}${formatNumber(result.stitchesPer10Cm)} \u043f. \u0438 ${formatNumber(result.rowsPer10Cm)} \u0440. \u043d\u0430 10 \u0441\u043c \u00b7 ${date}`;
      return row;
    }));
  }
  function setBusy(value) {
    busy = value;
    ui.confirm.disabled = value;
    ui.choosePhoto.disabled = value;
    ui.replacePhoto.disabled = value;
    ui.removePhoto.disabled = value;
  }

  function renderBlocked(title, message) {
    ui.loading.hidden = true;
    ui.ready.hidden = true;
    ui.blockedTitle.textContent = title;
    ui.blockedMessage.textContent = message;
    ui.blocked.hidden = false;
    ui.blockedAction.href = projectId ? safeWorkspaceHref() : "/";
    ui.blockedAction.focus();
  }

  function renderFatal(error) {
    const messages = {
      PROJECT_NOT_FOUND: "Проект не найден. Вернитесь в мастерскую и выберите его заново.",
      INVALID_PROJECT_ID: "Ссылка на проект повреждена.",
      IMPORTED_UNPROVEN: "Происхождение основы проекта не доказано.",
      QUARANTINED: "Основа проекта помещена в карантин.",
      INITIALIZATION_COLLISION: "Обнаружена коллизия основы проекта.",
    };
    renderBlocked("Помощник не может безопасно продолжить", messages[error?.code] || issueText(error) || "Проверьте подтверждённые сведения проекта и попробуйте снова.");
  }

  function revokePhotoUrl() {
    if (photoUrl) globalObject.URL.revokeObjectURL(photoUrl);
    photoUrl = "";
  }

  function cleanup() {
    globalObject.clearTimeout(saveTimer);
    revokePhotoUrl();
    if (projectImageUrl) globalObject.URL.revokeObjectURL(projectImageUrl);
    projectImageUrl = "";
    repository?.close().catch(() => undefined);
  }
})(typeof window !== "undefined" ? window : globalThis);
