"use strict";

(function exposeProjectDetailsExperience(globalObject) {
  const VERSION = 1;
  const SIZE_MODES = Object.freeze(["standard", "custom"]);
  const STANDARD_SIZES = Object.freeze([
    "XXXS", "XXS", "XS", "S", "M", "L", "XL", "XXL", "XXXL",
    "32", "34", "36", "38", "40", "42", "44", "46", "48", "50", "52", "54", "56", "58", "60",
  ]);
  const FIT_LABELS = Object.freeze({
    fitted: "По фигуре",
    regular: "Обычная посадка",
    relaxed: "Свободная",
    oversized: "Очень свободная",
  });
  const RECIPIENT_LABELS = Object.freeze({
    woman: "Для женщины",
    man: "Для мужчины",
    child: "Для ребёнка",
    neutral: "Без привязки к полу",
    other: "Другое",
  });
  const FIELD_CATALOG = Object.freeze({
    sizeMode: { label: "Способ задания размера", group: "mode" },
    recipient: { label: "Для кого вяжем", group: "context" },
    standardSize: { label: "Стандартный размер", group: "standard" },
    fit: { label: "Желаемая посадка", group: "fit" },
    bust: { label: "Обхват груди", group: "body", unit: "см", hint: "Измерь по самой широкой части груди. Лента лежит ровно и не стягивает тело." },
    waist: { label: "Обхват талии", group: "body", unit: "см", hint: "Измерь естественную линию талии без натяжения ленты." },
    hips: { label: "Обхват бёдер", group: "body", unit: "см", hint: "Измерь по самой широкой части бёдер." },
    shoulderWidth: { label: "Ширина плеч", group: "body", unit: "см", hint: "Измерь расстояние между крайними точками плеч по спине." },
    upperArm: { label: "Обхват плеча", group: "body", unit: "см", hint: "Измерь самую широкую часть верхней части руки без натяжения." },
    armholeDepth: { label: "Глубина проймы", group: "body", unit: "см", hint: "Измерь вертикально от плеча до уровня подмышки." },
    neck: { label: "Обхват шеи", group: "body", unit: "см", hint: "Лента проходит у основания шеи и не стягивает её." },
    head: { label: "Обхват головы", group: "body", unit: "см", hint: "Измерь по линии над бровями и самой широкой части затылка." },
    footLength: { label: "Длина стопы", group: "body", unit: "см", hint: "Измерь от пятки до конца самого длинного пальца." },
    hand: { label: "Обхват кисти", group: "body", unit: "см", hint: "Измерь кисть по самой широкой части без большого пальца." },
    garmentWidth: { label: "Ширина готовой детали", group: "garment", unit: "см", hint: "Укажи ширину готовой детали в разложенном виде, если она уже определена." },
    garmentLength: { label: "Длина готовой вещи", group: "garment", unit: "см", hint: "Измерь от высшей точки плеча до желаемого нижнего края." },
    sleeveLength: { label: "Длина рукава", group: "garment", unit: "см", hint: "Измерь от плечевой точки до желаемого края рукава." },
    necklineDepth: { label: "Глубина горловины", group: "garment", unit: "см", hint: "Укажи желаемую глубину от основания шеи, только если она важна." },
  });
  const BODY_FIELDS = Object.freeze(Object.keys(FIELD_CATALOG).filter((key) => FIELD_CATALOG[key].group === "body"));
  const GARMENT_FIELDS = Object.freeze(Object.keys(FIELD_CATALOG).filter((key) => FIELD_CATALOG[key].group === "garment"));

  function record(value) {
    return Boolean(value) && typeof value === "object" && !Array.isArray(value);
  }

  function copy(value) {
    if (typeof structuredClone === "function") return structuredClone(value);
    return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
  }

  function freeze(value) {
    if (!record(value) && !Array.isArray(value)) return value;
    Object.values(value).forEach(freeze);
    return Object.freeze(value);
  }

  function clean(value, maximum = 180) {
    if (typeof value !== "string") return "";
    return value.replace(/\s+/g, " ").trim().slice(0, maximum);
  }

  function token(value) {
    return clean(String(value || ""), 100).toLowerCase().replace(/[\s-]+/g, "_");
  }

  function safeSource(value) {
    return ["user", "standard_size", "project_description", "technology", "material"].includes(value)
      ? value
      : "project_description";
  }

  function unsafeRecord(value) {
    if (!record(value)) return false;
    const state = record(value.state) ? value.state : {};
    return Boolean(
      value.stale || state.stale || value.quarantined || state.quarantined ||
      value.collided || state.collided || value.conflict_id || state.conflict_id ||
      value.imported_unproven || state.imported_unproven ||
      value.importedUnproven || state.importedUnproven ||
      value.imported === true && value.proven === false ||
      state.imported === true && state.proven === false ||
      ["stale", "quarantined", "collided"].includes(token(value.status || state.status)),
    );
  }

  function progressSafety(records) {
    const source = Array.isArray(records) ? records : records ? [records] : [];
    return source.some((entry) => !record(entry) || unsafeRecord(entry))
      ? { safe: false, reason: "untrusted" }
      : { safe: true, reason: "" };
  }

  function normalizeMode(value) {
    const normalized = token(value);
    if (["standard", "standard_size", "size"].includes(normalized)) return "standard";
    if (["custom", "measurements", "personal", "own"].includes(normalized)) return "custom";
    return null;
  }

  function normalizeSize(value) {
    const normalized = clean(value, 12).toUpperCase();
    return STANDARD_SIZES.includes(normalized) ? normalized : "";
  }

  function normalizeFit(value) {
    const normalized = token(value);
    const aliases = {
      fitted: "fitted", close: "fitted", slim: "fitted", fitted_fit: "fitted", по_фигуре: "fitted", приталенный: "fitted",
      regular: "regular", normal: "regular", обычная: "regular", обычный: "regular",
      relaxed: "relaxed", loose: "relaxed", свободная: "relaxed", свободный: "relaxed",
      oversized: "oversized", oversize: "oversized", очень_свободная: "oversized", оверсайз: "oversized",
    };
    return aliases[normalized] || "";
  }

  function normalizeRecipient(value, gender, ageGroup) {
    const combined = token([value, gender, ageGroup].filter(Boolean).join(" "));
    if (/child|kid|реб/.test(combined)) return "child";
    if (/female|woman|жен/.test(combined)) return "woman";
    if (/male|man|муж/.test(combined)) return "man";
    if (/neutral|unisex|без_привязки/.test(combined)) return "neutral";
    return clean(value) ? "other" : "";
  }

  function normalizeMeasurement(value, fallbackSource = "project_description") {
    const source = record(value) ? value : { value };
    if (unsafeRecord(source)) return null;
    if (source.value === "" || source.value === null || source.value === undefined) return null;
    const numeric = Number(String(source.value).replace(",", "."));
    if (!Number.isFinite(numeric) || numeric <= 0) return null;
    const unit = token(source.unit) === "inch" ? "inch" : "cm";
    return {
      value: numeric,
      unit,
      provenance: safeSource(source.provenance || source.source || fallbackSource),
    };
  }

  function normalizeMeasurementGroup(value, fields, fallbackSource) {
    const source = record(value) ? value : {};
    const normalized = {};
    fields.forEach((field) => {
      const measurement = normalizeMeasurement(source[field], fallbackSource);
      if (measurement) normalized[field] = measurement;
    });
    return normalized;
  }

  function emptyDetails() {
    return {
      version: VERSION,
      sizeMode: null,
      standardSize: "",
      recipient: "",
      fit: "",
      bodyMeasurements: {},
      garmentMeasurements: {},
      provenance: {},
    };
  }

  function normalizeProjectDetails(value) {
    const source = record(value) && !unsafeRecord(value) ? value : {};
    const normalized = emptyDetails();
    normalized.sizeMode = normalizeMode(source.sizeMode || source.mode);
    normalized.standardSize = normalizeSize(source.standardSize || source.size);
    normalized.recipient = normalizeRecipient(source.recipient, source.gender, source.ageGroup);
    normalized.fit = normalizeFit(source.fit || source.style || source.ease);
    normalized.bodyMeasurements = normalizeMeasurementGroup(
      source.bodyMeasurements || source.body || source.measurements,
      BODY_FIELDS,
      "project_description",
    );
    normalized.garmentMeasurements = normalizeMeasurementGroup(
      source.garmentMeasurements || source.garment || source.finishedMeasurements,
      GARMENT_FIELDS,
      "project_description",
    );
    normalized.provenance = record(source.provenance) ? copy(source.provenance) : {};
    return normalized;
  }

  function detailsFromIntent(intent) {
    const source = record(intent) && !unsafeRecord(intent) ? intent : {};
    const normalized = emptyDetails();
    normalized.standardSize = normalizeSize(source.size);
    normalized.sizeMode = normalized.standardSize ? "standard" : null;
    normalized.recipient = normalizeRecipient(source.recipient, source.gender, source.ageGroup);
    normalized.fit = normalizeFit(source.fit || source.style || source.ease);
    const width = normalizeMeasurement(source.targetWidth, "project_description");
    if (width && token(source.targetWidth?.sizeKind || source.targetWidth?.size_kind) === "finished") {
      normalized.garmentMeasurements.garmentWidth = width;
    }
    const fieldStatus = record(source.fieldStatus) ? source.fieldStatus : {};
    for (const field of ["standardSize", "recipient", "fit"]) {
      if (normalized[field]) normalized.provenance[field] = fieldStatus[field] === "assumed" ? "project_description" : "project_description";
    }
    return normalized;
  }

  function mergeDetails(intentDetails, savedDetails) {
    const base = normalizeProjectDetails(intentDetails);
    const saved = normalizeProjectDetails(savedDetails);
    const merged = emptyDetails();
    for (const field of ["sizeMode", "standardSize", "recipient", "fit"]) {
      const savedIsUser = saved.provenance[field] === "user";
      merged[field] = savedIsUser && saved[field] ? saved[field] : saved[field] || base[field];
      if (merged[field]) merged.provenance[field] = savedIsUser ? "user" : saved.provenance[field] || base.provenance[field] || "project_description";
    }
    for (const [group, fields] of [["bodyMeasurements", BODY_FIELDS], ["garmentMeasurements", GARMENT_FIELDS]]) {
      fields.forEach((field) => {
        const stored = saved[group][field];
        const original = base[group][field];
        merged[group][field] = stored?.provenance === "user" ? stored : stored || original;
      });
    }
    return merged;
  }

  function garmentKind(value) {
    const normalized = token(value);
    if (/cardigan|кардиган/.test(normalized)) return "cardigan";
    if (/sweater|pullover|jumper|свитер|джемпер|пуловер/.test(normalized)) return "sweater";
    if (/vest|жилет/.test(normalized)) return "vest";
    if (/dress|плать/.test(normalized)) return "dress";
    if (/top|топ/.test(normalized)) return "top";
    if (/hat|beret|шап|берет/.test(normalized)) return "hat";
    if (/scarf|snood|шарф|снуд/.test(normalized)) return "scarf";
    if (/sock|нос/.test(normalized)) return "socks";
    if (/mitten|glove|вареж|перчат/.test(normalized)) return "mittens";
    if (/blanket|плед|покрывал/.test(normalized)) return "blanket";
    return "other";
  }

  function hasSleeves(kind, technology) {
    if (["sweater", "cardigan"].includes(kind)) return true;
    if (kind === "vest") return false;
    const text = JSON.stringify(technology || {}).toLowerCase();
    return /sleeve|рукав/.test(text);
  }

  function fieldValue(details, field) {
    if (["sizeMode", "standardSize", "recipient", "fit"].includes(field)) return details[field];
    return details.bodyMeasurements[field] || details.garmentMeasurements[field] || null;
  }

  function requiredFields(input = {}) {
    const details = normalizeProjectDetails(input.details);
    const kind = garmentKind(input.garmentType);
    const required = ["sizeMode", "recipient"];
    if (details.sizeMode === "standard") required.push("standardSize");
    if (details.sizeMode === "custom") {
      if (["sweater", "cardigan", "vest", "dress", "top"].includes(kind)) required.push("bust");
      else if (kind === "hat") required.push("head");
      else if (kind === "socks") required.push("footLength");
      else if (kind === "mittens") required.push("hand");
    }
    if (["sweater", "cardigan", "vest", "dress", "top"].includes(kind)) required.push("fit", "garmentLength");
    if (hasSleeves(kind, input.technology)) required.push("sleeveLength");
    if (["scarf", "blanket"].includes(kind)) required.push("garmentWidth", "garmentLength");
    return [...new Set(required)].map((field, order) => ({
      field,
      label: FIELD_CATALOG[field]?.label || "Параметр",
      order,
      value: fieldValue(details, field),
    }));
  }

  function visibleFields(input = {}) {
    const details = normalizeProjectDetails(input.details);
    const kind = garmentKind(input.garmentType);
    const required = new Set(requiredFields(input).map((entry) => entry.field));
    const fields = ["sizeMode", "recipient"];
    if (details.sizeMode === "standard") fields.push("standardSize");
    if (details.sizeMode === "custom") {
      if (["sweater", "cardigan", "vest", "dress", "top", "other"].includes(kind)) fields.push("bust", "waist", "hips", "shoulderWidth", "upperArm", "armholeDepth", "neck");
      if (kind === "hat") fields.push("head");
      if (kind === "socks") fields.push("footLength");
      if (kind === "mittens") fields.push("hand");
    }
    if (["sweater", "cardigan", "vest", "dress", "top"].includes(kind)) fields.push("fit");
    fields.push("garmentWidth", "garmentLength");
    if (hasSleeves(kind, input.technology)) fields.push("sleeveLength");
    if (["sweater", "cardigan", "vest", "dress", "top"].includes(kind)) fields.push("necklineDepth");
    return [...new Set(fields)].map((field, order) => ({
      field,
      order,
      ...FIELD_CATALOG[field],
      required: required.has(field),
      value: fieldValue(details, field),
    }));
  }

  function missingFields(input = {}) {
    return requiredFields(input).filter((entry) => !entry.value);
  }

  function nextMissingField(input = {}) {
    return missingFields(input)[0] || null;
  }

  function sourceLabel(value) {
    return {
      user: "Указано тобой",
      standard_size: "Из стандартного размера",
      project_description: "Из описания проекта",
      technology: "Из выбранного способа вязания",
      material: "Из материалов",
    }[safeSource(value)] || "Из описания проекта";
  }

  function formatMeasurement(measurement) {
    if (!measurement) return "";
    return `${measurement.value} ${measurement.unit === "inch" ? "дюйм." : "см"}`;
  }

  function knownSummary(input = {}) {
    const details = normalizeProjectDetails(input.details);
    const rows = [];
    const add = (label, value, provenance) => { if (value) rows.push({ label, value, source: sourceLabel(provenance) }); };
    add("Изделие", clean(input.garmentType), "project_description");
    add("Для кого", RECIPIENT_LABELS[details.recipient], details.provenance.recipient);
    if (details.sizeMode === "standard") add("Размер", details.standardSize, details.provenance.standardSize);
    add("Посадка", FIT_LABELS[details.fit], details.provenance.fit);
    for (const field of BODY_FIELDS) {
      const measurement = details.bodyMeasurements[field];
      add(FIELD_CATALOG[field].label, formatMeasurement(measurement), measurement?.provenance);
    }
    for (const field of GARMENT_FIELDS) {
      const measurement = details.garmentMeasurements[field];
      add(FIELD_CATALOG[field].label, formatMeasurement(measurement), measurement?.provenance);
    }
    add("Пряжа", clean(input.intent?.yarn), "material");
    const needle = input.intent?.needleMm || input.intent?.needle_mm || input.intent?.fabricContext?.needle_mm;
    add("Спицы", Number.isFinite(Number(needle)) ? `${Number(needle)} мм` : "", "material");
    return rows;
  }

  function readinessPresentation(input = {}) {
    const missing = missingFields(input);
    const readiness = record(input.readiness) ? input.readiness : null;
    const blockers = Array.isArray(readiness?.blockers) ? readiness.blockers : [];
    const safe = input.safe !== false;
    let next = nextMissingField(input);
    if (!next && readiness?.status === "collecting") {
      const item = Array.isArray(readiness.missingRequired) ? readiness.missingRequired[0] : null;
      if (item) next = { field: item.field, label: clean(item.label) || "обязательный параметр" };
    }
    let action = { enabled: false, label: "Продолжить", href: "", description: next ? `Сначала укажи: ${next.label.toLowerCase()}.` : "Сначала сохрани обязательные параметры." };
    if (safe && !missing.length && !blockers.length && readiness?.status === "ready_for_sample") {
      action = { enabled: true, label: "Перейти к образцу", href: input.swatchHref || "#swatch-assistant", description: "Следующий шаг — образец и плотность." };
    }
    if (safe && !missing.length && !blockers.length && readiness?.status === "ready_for_calculation" && clean(readiness?.nextAction?.href, 1400).startsWith("/calculator")) {
      action = { enabled: true, label: "Перейти к расчёту", href: readiness.nextAction.href, description: "Следующий шаг — расчёт петель и рядов." };
    }
    return { ready: action.enabled, next, missing, blockers: blockers.map((item) => clean(item.message)).filter(Boolean), action };
  }

  function detectModeConflict(details) {
    const normalized = normalizeProjectDetails(details);
    const hasCustom = Object.keys(normalized.bodyMeasurements).length > 0;
    if (normalized.standardSize && hasCustom && normalized.provenance.sizeMode !== "user") {
      return { active: true, message: "Ты указала собственные мерки. Подтверди, какой режим использовать для расчёта." };
    }
    if (normalized.standardSize && hasCustom) {
      return { active: false, message: normalized.sizeMode === "custom" ? "Для расчёта используются собственные мерки." : "Собственные мерки сохранены, но сейчас не применяются." };
    }
    return { active: false, message: "" };
  }

  function validateField(field, value) {
    if (!FIELD_CATALOG[field]) return { valid: false, error: "Неизвестный параметр.", warning: "" };
    if (["sizeMode", "recipient", "standardSize", "fit"].includes(field)) {
      const valid = field === "sizeMode" ? Boolean(normalizeMode(value))
        : field === "standardSize" ? Boolean(normalizeSize(value))
          : field === "fit" ? Boolean(normalizeFit(value))
            : Boolean(RECIPIENT_LABELS[value]);
      return { valid, error: valid ? "" : "Выбери один из предложенных вариантов.", warning: "" };
    }
    if (value === "" || value === null || value === undefined) return { valid: true, empty: true, error: "", warning: "" };
    const numeric = Number(String(value).replace(",", "."));
    if (!Number.isFinite(numeric)) return { valid: false, error: "Укажи значение в сантиметрах.", warning: "" };
    if (numeric <= 0) return { valid: false, error: "Значение должно быть больше нуля.", warning: "" };
    if (numeric > 500) return { valid: false, error: "Проверь значение: оно выходит за технический диапазон.", warning: "" };
    const warning = numeric < 10 || numeric > 250 ? "Проверь мерку: значение необычное. Если всё верно, его можно сохранить." : "";
    return { valid: true, error: "", warning };
  }

  function applyPatch(existing, patch = {}) {
    const result = normalizeProjectDetails(existing);
    const source = record(patch) ? patch : {};
    for (const field of ["sizeMode", "standardSize", "recipient", "fit"]) {
      if (!Object.prototype.hasOwnProperty.call(source, field) || source[field] === "" || source[field] === null) continue;
      const normalized = field === "sizeMode" ? normalizeMode(source[field])
        : field === "standardSize" ? normalizeSize(source[field])
          : field === "fit" ? normalizeFit(source[field])
            : RECIPIENT_LABELS[source[field]] ? source[field] : "";
      if (normalized) { result[field] = normalized; result.provenance[field] = "user"; }
    }
    for (const [group, fields] of [["bodyMeasurements", BODY_FIELDS], ["garmentMeasurements", GARMENT_FIELDS]]) {
      fields.forEach((field) => {
        if (!Object.prototype.hasOwnProperty.call(source, field) || source[field] === "" || source[field] === null) return;
        const validation = validateField(field, source[field]);
        if (!validation.valid || validation.empty) return;
        result[group][field] = { value: Number(String(source[field]).replace(",", ".")), unit: "cm", provenance: "user" };
      });
    }
    return result;
  }

  function applyDetailsToIntent(intent, details) {
    const next = record(intent) ? copy(intent) : {};
    const normalized = normalizeProjectDetails(details);
    next.fieldStatus = record(next.fieldStatus) ? next.fieldStatus : {};
    if (normalized.recipient) {
      next.recipient = RECIPIENT_LABELS[normalized.recipient];
      next.fieldStatus.recipient = "known";
    }
    if (normalized.sizeMode === "standard" && normalized.standardSize) {
      next.size = normalized.standardSize;
      next.fieldStatus.size = "known";
    }
    if (normalized.fit) {
      next.style = FIT_LABELS[normalized.fit];
      next.fieldStatus.style = "known";
    }
    const width = normalized.garmentMeasurements.garmentWidth;
    if (width) {
      next.targetWidth = { value: width.value, unit: width.unit, sizeKind: "finished" };
      next.fieldStatus.targetWidth = "known";
    }
    return next;
  }
  function contextFromAggregate(aggregate) {
    const value = record(aggregate) ? aggregate : {};
    const project = record(value.project) ? value.project : null;
    if (!project) return freeze({ project: null, intent: {}, details: emptyDetails(), technology: null, relevantProgress: [], collaborationState: {}, closureHistory: null });
    const calculations = Array.isArray(value.calculations) ? value.calculations : [];
    const calculation = calculations.find((entry) => entry?.calculation_id === project.active_calculation_id) || calculations.at(-1) || null;
    const calculationIntent = calculation?.request?.project_intent || calculation?.request?.projectIntent || {};
    const draftIntent = project.draft_input?.project_intent || project.draft_input?.projectIntent || {};
    const intent = { ...copy(calculationIntent), ...copy(draftIntent), fieldStatus: { ...copy(calculationIntent.fieldStatus || {}), ...copy(draftIntent.fieldStatus || {}) } };
    const progress = Array.isArray(value.progress) ? value.progress : [];
    const drafts = progress.filter((entry) => entry?.kind === "PATTERN_TECHNOLOGY_DRAFT");
    const reviews = progress.filter((entry) => entry?.kind === "PATTERN_TECHNOLOGY_REVIEW");
    const latestDraft = drafts.at(-1)?.state;
    const details = mergeDetails(detailsFromIntent(intent), project.draft_input?.project_details_experience);
    return freeze({
      project: copy(project),
      intent,
      details,
      technology: copy(latestDraft?.draftResult || latestDraft || null),
      relevantProgress: copy([...drafts, ...reviews]),
      collaborationState: copy(project.draft_input?.project_details_collaboration || {}),
      closureHistory: copy(project.draft_input?.project_details_closures || null),
    });
  }


  function buildViewModel(input = {}) {
    const project = record(input.project) ? input.project : null;
    const projectId = clean(project?.project_id || input.projectId, 180);
    if (!projectId) return freeze({ state: "missing_project", heading: "Проект не найден", lead: "Вернись в мастерскую и выбери проект заново.", links: { workshop: "/", projects: "/#saved-projects" } });
    const safety = progressSafety(input.progressRecords || input.progressRecord);
    if (!safety.safe || input.storageError) return freeze({ state: "error", heading: "Не удалось открыть параметры проекта", lead: "Попробуй обновить страницу.", project: { id: projectId, title: clean(project?.title) || "Проект" }, links: { workshop: "/", technology: `/pattern-technology-draft?project=${encodeURIComponent(projectId)}` } });
    const intentDetails = detailsFromIntent(input.intent);
    const details = mergeDetails(intentDetails, input.saved || project?.draft_input?.project_details_experience);
    const context = { details, garmentType: input.intent?.garmentType || input.garmentType, technology: input.technology };
    const readiness = readinessPresentation({ ...context, readiness: input.readiness, safe: true, swatchHref: `/user-workspace-entry?project=${encodeURIComponent(projectId)}#swatch-assistant` });
    const conflict = detectModeConflict(details);
    if (conflict.active) readiness.action.enabled = false;
    return freeze({
      version: VERSION,
      state: "ready",
      heading: "Для кого и какого размера вяжем?",
      lead: "Выбери стандартный размер или укажи свои мерки. YarnAI попросит только то, что нужно для этой вещи.",
      project: { id: projectId, title: clean(project?.title) || "Проект" },
      garmentType: clean(input.intent?.garmentType || input.garmentType) || "изделие",
      details,
      fields: visibleFields(context),
      required: requiredFields(context),
      nextMissing: nextMissingField(context),
      known: knownSummary({ ...context, intent: input.intent }),
      missing: missingFields(context),
      conflict,
      readiness,
      links: {
        technology: `/pattern-technology-draft?project=${encodeURIComponent(projectId)}`,
        workshop: "/",
        projects: "/#saved-projects",
      },
    });
  }

  const api = Object.freeze({
    VERSION, SIZE_MODES, STANDARD_SIZES, FIT_LABELS, RECIPIENT_LABELS, FIELD_CATALOG,
    normalizeMode, normalizeSize, normalizeFit, normalizeMeasurement, normalizeProjectDetails,
    detailsFromIntent, mergeDetails, garmentKind, hasSleeves, requiredFields, visibleFields,
    missingFields, nextMissingField, sourceLabel, knownSummary, progressSafety, detectModeConflict,
    validateField, applyPatch, applyDetailsToIntent, contextFromAggregate, readinessPresentation, buildViewModel,
  });
  globalObject.YarnAIProjectDetailsExperience = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
