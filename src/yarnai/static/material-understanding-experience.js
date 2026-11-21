"use strict";

(function exposeMaterialUnderstandingExperience(globalObject) {
  const VERSION = 1;
  const TRUST = Object.freeze({
    confirmed: "Понятно",
    assumed: "Нужно подтвердить",
    unknown: "Пока неизвестно",
  });
  const GARMENTS = Object.freeze({
    sweater: "свитер", cardigan: "кардиган", pullover: "джемпер",
    vest: "жилет", top: "топ", tshirt: "футболка", polo: "поло",
    dress: "платье", skirt: "юбка", pants: "брюки", shorts: "шорты",
    coat: "пальто", jacket: "жакет", hat: "шапка", scarf: "шарф",
    shawl: "шаль", socks: "носки", mittens: "варежки", gloves: "перчатки",
    blanket: "плед", bag: "сумка", toy: "игрушка",
  });
  const VALUE_LABELS = Object.freeze({
    knitting: "вязание спицами", crochet: "вязание крючком",
    machine_knitting: "машинное вязание", mixed: "смешанная техника",
    top_down: "сверху вниз", bottom_up: "снизу вверх", sideways: "поперёк",
    modular: "модульно", separate_pieces: "отдельными деталями",
    raglan: "реглан", set_in_sleeve: "втачной рукав",
    drop_shoulder: "спущенное плечо", circular_yoke: "круглая кокетка",
    yoke: "кокетка", saddle_shoulder: "плечо-погон", contiguous: "контiguous",
    in_the_round: "по кругу", flat: "поворотными рядами",
  });
  const QUESTION_COPY = Object.freeze({
    garmentType: "Что именно ты хочешь связать?",
    technique: "Какой тип рукоделия используется?",
    recipient: "Для кого будет эта вещь?",
    size: "Какой размер нужен?",
    style: "Какой должна быть посадка?",
    yarn: "Какую пряжу планируешь использовать?",
    targetWidth: "Какая готовая ширина первой детали нужна?",
    sampleKnown: "Есть ли уже связанный контрольный образец?",
    gauge: "Какая плотность вязания у образца?",
    preserve: "Что в этой вещи особенно важно сохранить?",
    desiredChanges: "Что в исходном варианте нужно изменить?",
    desiredFeatures: "Каким должен получиться результат?",
  });
  const FIELD_ORDER = Object.freeze([
    "sourceSizes", "sourceFinishedChest", "sourceGauge", "sourceNeedles", "sourceYarnWeight", "sourceYarnSamples", "sourceConstruction",
    "profileSize", "profileGauge", "profileNeedles", "profileYarn",
    "garmentType", "recipient", "style", "size", "construction", "technique",
    "yarn", "targetWidth", "sampleKnown", "gauge", "preserve",
    "desiredChanges", "desiredFeatures",
  ]);
  const FIELD_LABELS = Object.freeze({
    garmentType: "Изделие", recipient: "Для кого", style: "Посадка",
    size: "Размер", construction: "Конструкция", technique: "Техника",
    yarn: "Пряжа", targetWidth: "Готовая ширина",
    sampleKnown: "Контрольный образец", gauge: "Плотность",
    preserve: "Важно сохранить", desiredChanges: "Нужно изменить",
    desiredFeatures: "Желаемый результат", description: "Краткое описание",
    goal: "Главное пожелание",
    sourceSizes: "Источник · размеры", sourceFinishedChest: "Источник · ML",
    sourceGauge: "Источник · плотность", sourceNeedles: "Источник · спицы",
    sourceYarnWeight: "Источник · толщина пряжи", sourceYarnSamples: "Источник · образцы пряжи",
    sourceConstruction: "Источник · последовательность",
    profileSize: "Адаптация · выбранный размер", profileGauge: "Адаптация · плотность",
    profileNeedles: "Адаптация · спицы", profileYarn: "Адаптация · пряжа",
  });
  const REVIEW_FIELD_BY_CATEGORY = Object.freeze({
    product: "garmentType", garment: "garmentType", craft: "technique",
    construction: "construction", sizes: "size", yarn: "yarn", gauge: "gauge",
  });

  function buildViewModel(input = {}) {
    const source = copy(input);
    const project = record(source.project) ? source.project : null;
    const projectId = clean(project?.project_id || source.projectId, 160);
    if (!projectId) return missingProjectModel();

    const safety = progressSafety(source);
    if (!safety.safe) return failureModel(project, projectId, safety.reason, source);

    const semantic = normalizeSemantic(source.semantic || source.analysis);
    if (semantic.failed) return failureModel(project, projectId, "analysis", source);
    const review = normalizeReview(source.review);
    const saved = normalizeSaved(source.saved || project?.draft_input?.material_understanding);
    const intent = applySavedAnswers(normalizeIntent(source.intent || intentFromProject(source)), saved);
    const readiness = record(source.readiness) ? copy(source.readiness) : null;
    const sources = sourceSummary(source, semantic);
    const currentUserFields = userCanonicalFields(saved, review);
    const items = collectItems({ semantic, review, intent, saved, currentUserFields });
    const confirmed = uniqueItems(items.filter((item) => item.trust === "confirmed"));
    const assumed = uniqueItems(items.filter((item) => item.trust === "assumed"));
    const conflicts = collectConflicts(review, items);
    const missing = collectMissing(intent, readiness, semantic, saved, review, currentUserFields);
    const nextQuestion = selectNextQuestion({
      questions: source.questions,
      missing,
      answered: [...saved.answers, ...saved.corrections],
    });
    const corrupted = semantic.present && !semantic.valid;
    const hasResult = semantic.present && semantic.valid && semantic.complete;
    const semanticReviewable = semantic.result?.garment?.type !== "unknown" && semantic.result?.craft?.value !== "unknown";
    const reviewBlocks = blockingReviewFields(review).filter((item) => !currentUserFields.has(item.field));
    const canConfirmReview = review.present
      ? review.confirmed || review.canConfirm || (review.valid && reviewBlocks.length === 0)
      : semanticReviewable;
    const ready = hasResult && !corrupted && conflicts.length === 0 &&
      !nextQuestion?.required && canConfirmReview;
    const garment = summaryGarment(items, intent, saved);

    return freeze({
      version: VERSION,
      state: corrupted ? "error" : hasResult ? "ready" : "loading",
      project: { id: projectId, title: clean(project?.title, 160) },
      heading: hasResult ? "Вот что YarnAI понял" : "Разбираем материалы",
      lead: hasResult
        ? "Проверь описание. Если что-то неверно, это можно исправить."
        : "Результат появится здесь после реального разбора материалов.",
      summary: garment,
      confirmed,
      assumed,
      unknown: missing.map((item) => ({ ...item, trust: "unknown", trustLabel: TRUST.unknown })),
      missing,
      nextQuestion,
      sources,
      conflicts,
      correctionFields: correctionFields(items),
      readiness: { ready, reviewConfirmed: review.confirmed, canConfirmReview },
      continueAction: {
        enabled: ready,
        label: review.confirmed ? "Продолжить" : "Перейти к проверке",
        href: review.confirmed
          ? `/pattern-technology-draft?project=${encodeURIComponent(projectId)}`
          : `/pattern-analysis-review?project=${encodeURIComponent(projectId)}`,
      },
      links: {
        materials: `/import-pattern?project=${encodeURIComponent(projectId)}`,
        workshop: "/",
      },
      error: corrupted ? failureCopy("Не удалось разобрать материалы", "Проверь загруженные материалы или попробуй изменить описание.") : null,
    });
  }

  function missingProjectModel() {
    return freeze({
      version: VERSION, state: "missing_project", project: null,
      heading: "Проект не найден",
      lead: "Вернись в мастерскую и выбери проект заново.",
      summary: null, confirmed: [], assumed: [], unknown: [], missing: [],
      nextQuestion: null, sources: [], conflicts: [], correctionFields: [],
      readiness: { ready: false, reviewConfirmed: false, canConfirmReview: false },
      continueAction: { enabled: false, label: "Подтвердить и продолжить", href: "/" },
      links: { materials: "/import-pattern", workshop: "/" }, error: null,
    });
  }

  function failureModel(project, projectId, reason, source) {
    const storage = reason === "storage";
    return freeze({
      version: VERSION, state: "error",
      project: { id: projectId, title: clean(project?.title, 160) },
      heading: storage ? "Не удалось открыть результат разбора" : "Не удалось разобрать материалы",
      lead: storage ? "Попробуй обновить страницу." : "Проверь загруженные материалы или попробуй изменить описание.",
      summary: null, confirmed: [], assumed: [], unknown: [], missing: [], nextQuestion: null,
      sources: sourceSummary(source, normalizeSemantic(source.semantic || source.analysis)),
      conflicts: [], correctionFields: [],
      readiness: { ready: false, reviewConfirmed: false, canConfirmReview: false },
      continueAction: { enabled: false, label: "Подтвердить и продолжить", href: "" },
      links: { materials: `/import-pattern?project=${encodeURIComponent(projectId)}`, workshop: "/" },
      error: failureCopy(storage ? "Не удалось открыть результат разбора." : "Не удалось разобрать материалы", storage ? "Попробуй обновить страницу." : "Проверь загруженные материалы или попробуй изменить описание."),
    });
  }

  function failureCopy(title, message) { return { title, message }; }

  function progressSafety(input) {
    if (input.storageError) return { safe: false, reason: "storage" };
    const progress = input.progressRecord || input.semanticProgress || null;
    if (!progress) return { safe: true, reason: null };
    if (progress.epoch !== undefined && progress.epoch !== 1) return { safe: false, reason: "stale" };
    if (progress.conflict_id || progress.collided === true) return { safe: false, reason: "collided" };
    if (progress.quarantined === true || progress.quarantine_id) return { safe: false, reason: "quarantined" };
    if (progress.imported === true && progress.proven === false) return { safe: false, reason: "imported" };
    if (["stale", "corrupted", "quarantined", "collided", "superseded"].includes(clean(input.analysisState || progress.stateName).toLowerCase())) return { safe: false, reason: "stale" };
    return { safe: true, reason: null };
  }

  function normalizeSemantic(value) {
    if (!value) return { present: false, valid: true, complete: false, failed: false, result: null };
    const state = record(value) && record(value.result) ? value : { status: "completed", result: value };
    const result = state.result;
    const valid = record(result) && record(result.garment) && record(result.craft) &&
      record(result.construction) && record(result.sourceSummary);
    const status = clean(state.status || "completed");
    return {
      present: true, valid,
      complete: valid && ["completed", "partial"].includes(status),
      failed: valid && status === "failed",
      result: valid ? copy(result) : null,
    };
  }

  function normalizeReview(value) {
    if (!record(value)) return { present: false, confirmed: false, canConfirm: true, valid: true, items: [], groups: [] };
    const data = record(value.reviewedData) ? value.reviewedData : {};
    return {
      present: true,
      confirmed: value.status === "confirmed" && record(value.confirmedSnapshot),
      canConfirm: value.validation?.canConfirm === true,
      valid: value.validation?.isValid !== false && !(value.validation?.errors || []).length,
      items: Array.isArray(data.items) ? copy(data.items) : [],
      groups: Array.isArray(data.conflictGroups) ? copy(data.conflictGroups) : [],
    };
  }

  function normalizeIntent(value) {
    const intent = record(value) ? copy(value) : {};
    intent.fieldStatus = record(intent.fieldStatus) ? intent.fieldStatus : {};
    intent.assumptions = Array.isArray(intent.assumptions) ? intent.assumptions : [];
    intent.missingInformation = Array.isArray(intent.missingInformation) ? intent.missingInformation : [];
    intent.preferences = record(intent.preferences) ? intent.preferences : {};
    return intent;
  }

  function normalizeSaved(value) {
    const source = record(value) ? copy(value) : {};
    return {
      version: VERSION,
      answers: Array.isArray(source.answers) ? source.answers.filter(validUserEntry) : [],
      corrections: Array.isArray(source.corrections) ? source.corrections.filter(validUserEntry) : [],
    };
  }

  function validUserEntry(value) {
    return record(value) && clean(value.id, 180) && clean(value.field, 80) &&
      clean(value.value, 500) && value.provenance === "user";
  }

  function intentFromProject(input) {
    const calculation = input.calculation || (input.calculations || []).find((entry) => entry.calculation_id === input.project?.active_calculation_id);
    return calculation?.request?.project_intent || calculation?.request?.projectIntent ||
      input.project?.draft_input?.project_intent || {};
  }

  function applySavedAnswers(intent, saved) {
    const next = copy(intent);
    for (const answer of saved.answers) setIntentField(next, answer.field, answer.value);
    for (const correction of saved.corrections) setIntentField(next, correction.field, correction.value);
    return next;
  }

  function setIntentField(intent, field, value) {
    if (["preserve", "desiredChanges", "desiredFeatures"].includes(field)) intent.preferences[field] = value;
    else intent[field] = value;
    intent.fieldStatus[field] = "known";
    intent.assumptions = intent.assumptions.filter((item) => item?.field !== field);
    intent.missingInformation = intent.missingInformation.filter((item) => item?.field !== field);
  }

  function collectItems({ semantic, review, intent, saved, currentUserFields }) {
    const items = [];
    const push = (field, label, value, trust, origin, confidence = null) => {
      const formatted = displayValue(value);
      if (!formatted || formatted === "unknown") return;
      items.push({ field, label, value: formatted, trust, trustLabel: TRUST[trust], origin });
    };
    const result = semantic.result;
    if (result) {
      push("garmentType", FIELD_LABELS.garmentType, GARMENTS[result.garment.type] || result.garment.type, trustFromConfidence(result.garment.confidence), "analysis", result.garment.confidence);
      push("technique", FIELD_LABELS.technique, VALUE_LABELS[result.craft.value] || result.craft.value, trustFromConfidence(result.craft.confidence), "analysis", result.craft.confidence);
      push("construction", FIELD_LABELS.construction, VALUE_LABELS[result.construction.method] || result.construction.method, trustFromConfidence(result.construction.confidence), "analysis", result.construction.confidence);
      for (const feature of result.construction.features || []) push(`construction:${feature}`, "Деталь", VALUE_LABELS[feature] || feature, trustFromConfidence(result.construction.confidence), "analysis", result.construction.confidence);
      if (result.sizing?.selectedSize) push("size", FIELD_LABELS.size, result.sizing.selectedSize, trustFromConfidence(result.sizing.confidence), "analysis", result.sizing.confidence);
      for (const name of result.yarn?.names || []) push("yarn", FIELD_LABELS.yarn, reviewValue(name), trustFromConfidence(result.yarn.confidence), "analysis", result.yarn.confidence);
      for (const pattern of result.stitchPatterns || []) push("pattern", "Узор", reviewValue(pattern), "confirmed", "analysis", pattern.confidence);
      for (const entry of result.parameterLedger || []) {
        const mapped = sourceLedgerItem(entry);
        if (mapped) push(mapped.field, mapped.label, mapped.value, "confirmed", "source_ledger", entry.confidence);
      }
      const profile = result.userAdaptationProfile || {};
      if (profile.selectedSize?.value) push("profileSize", FIELD_LABELS.profileSize, profile.selectedSize.value, "confirmed", "adaptation_profile");
      for (const entry of profile.gauge?.entries || []) push("profileGauge", FIELD_LABELS.profileGauge, gaugeText(entry), "confirmed", "adaptation_profile");
      if (profile.tools?.needleSizes?.length) push("profileNeedles", FIELD_LABELS.profileNeedles, `${profile.tools.needleSizes.map((entry) => entry.canonicalValue).join(", ")} mm`, "confirmed", "adaptation_profile");
      if (profile.yarn?.names?.length) push("profileYarn", FIELD_LABELS.profileYarn, profile.yarn.names.map((entry) => entry.name).join(", "), "confirmed", "adaptation_profile");
    }
    for (const field of FIELD_ORDER) {
      const raw = intentValue(intent, field);
      if (raw === null || raw === undefined || raw === "") continue;
      const assumed = intent.fieldStatus[field] === "assumed" || intent.assumptions.some((entry) => entry?.field === field);
      push(field, FIELD_LABELS[field] || field, raw, assumed ? "assumed" : "confirmed", "intent");
    }
    for (const item of review.items) {
      if (!["accepted", "corrected"].includes(item.decision)) continue;
      const mapped = reviewItem(item);
      if (!mapped) continue;
      push(mapped.field, mapped.label, item.reviewedValue, item.decision === "corrected" || item.decision === "accepted" ? "confirmed" : "assumed", item.decision === "corrected" ? "user" : "review", item.confidence);
    }
    for (const answer of saved.answers) push(answer.field, FIELD_LABELS[answer.field] || "Ответ", answer.value, "confirmed", "user");
    for (const correction of saved.corrections) push(correction.field, FIELD_LABELS[correction.field] || "Исправление", correction.value, "confirmed", "user");
    return stableItems(items).filter((item) => {
      const field = item.field.split(":")[0];
      return !currentUserFields.has(field) || item.origin === "user";
    });
  }

  function reviewItem(item) {
    const mapping = {
      product: ["garmentType", "Изделие"], garment: ["garmentType", "Изделие"], craft: ["technique", "Техника"],
      construction: ["construction", "Конструкция"], sizing: ["size", "Размер"],
      yarn: ["yarn", "Пряжа"], gauge: ["gauge", "Плотность"],
      stitchPatterns: ["pattern", "Узор"],
    };
    const pair = mapping[item.category];
    return pair ? { field: pair[0], label: pair[1] } : null;
  }

  function reviewValue(value) {
    if (record(value)) return value.value ?? value.name ?? value.label ?? value.rawText ?? "";
    return value;
  }

  function sourceLedgerItem(entry) {
    const type = String(entry?.semanticType || "");
    const value = entry?.canonicalValue;
    if (type === "source.sizes.available" && Array.isArray(value)) return { field: "sourceSizes", label: FIELD_LABELS.sourceSizes, value: `${value.length}: ${value.join(", ")}` };
    if (type === "source.sizing.finished_chest" && record(value)) return { field: "sourceFinishedChest", label: FIELD_LABELS.sourceFinishedChest, value: `${value.sizeLabel} — ${value.in} in / ${value.cm} cm` };
    if (type === "source.gauge" && record(value)) return { field: "sourceGauge", label: FIELD_LABELS.sourceGauge, value: gaugeText(value) };
    if (type === "source.tools.needles" && Array.isArray(value)) return { field: "sourceNeedles", label: FIELD_LABELS.sourceNeedles, value: `${value.join(", ")} mm` };
    if (type === "source.yarn.weight" && Array.isArray(value)) return { field: "sourceYarnWeight", label: FIELD_LABELS.sourceYarnWeight, value: value.join(" / ") };
    if (type === "source.yarn.samples" && Array.isArray(value)) return { field: "sourceYarnSamples", label: FIELD_LABELS.sourceYarnSamples, value: value.join("; ") };
    if (type === "source.construction" && record(value)) return { field: "sourceConstruction", label: FIELD_LABELS.sourceConstruction, value: (value.sequence || []).join(" → ") };
    return null;
  }

  function gaugeText(value) {
    if (!record(value)) return "";
    const counts = [];
    if (value.stitches !== null && value.stitches !== undefined && Number.isFinite(Number(value.stitches))) counts.push(`${value.stitches} п.`);
    if (value.rows !== null && value.rows !== undefined && Number.isFinite(Number(value.rows))) counts.push(`${value.rows} р.`);
    if (value.rounds !== null && value.rounds !== undefined && Number.isFinite(Number(value.rounds))) counts.push(`${value.rounds} круг. р.`);
    return counts.length && Number.isFinite(Number(value.per)) ? `${counts.join(" + ")} на ${value.per} ${value.unit || ""}`.trim() : "";
  }

  function intentValue(intent, field) {
    if (["preserve", "desiredChanges", "desiredFeatures"].includes(field)) return intent.preferences[field];
    if (field === "sampleKnown") return intent.sampleKnown === true ? "образец связан" : intent.sampleKnown === false ? "образца пока нет" : null;
    return intent[field];
  }

  function displayValue(value) {
    if (value === null || value === undefined) return "";
    if (typeof value === "string" || typeof value === "number") return clean(String(value), 500);
    if (typeof value === "boolean") return value ? "да" : "нет";
    if (record(value)) {
      if (Number.isFinite(Number(value.value))) return `${value.value}${value.unit ? ` ${value.unit}` : ""}`;
      if (Number.isFinite(Number(value.stitches)) && Number.isFinite(Number(value.widthCm))) return `${value.stitches} петель на ${value.widthCm} см`;
      return clean(value.raw || value.rawText || value.name || value.label || "", 500);
    }
    return "";
  }

  function trustFromConfidence(value) {
    const number = Number(value);
    if (!Number.isFinite(number) || number <= 0) return "unknown";
    return number >= 0.8 ? "confirmed" : "assumed";
  }

  function stableItems(items) {
    return items.map((item, index) => ({ ...item, _index: index })).sort((a, b) => {
      const left = FIELD_ORDER.indexOf(a.field.split(":")[0]);
      const right = FIELD_ORDER.indexOf(b.field.split(":")[0]);
      return (left < 0 ? 999 : left) - (right < 0 ? 999 : right) || a._index - b._index;
    }).map(({ _index, ...item }) => item);
  }

  function uniqueItems(items) {
    const selected = new Map();
    for (const item of items) {
      const key = `${item.field}|${item.value}`.toLowerCase();
      if (!selected.has(key) || item.origin === "user") selected.set(key, item);
    }
    return [...selected.values()];
  }

  function collectMissing(intent, readiness, semantic, saved, review, currentUserFields) {
    const values = [];
    const add = (value, fallbackIndex) => {
      const field = clean(value?.field, 80);
      if (!field || currentUserFields.has(field)) return;
      values.push({
        field, label: clean(value.label || FIELD_LABELS[field] || field, 180),
        reason: clean(value.reason, 240), required: value.required !== false,
        priority: Number.isFinite(Number(value.priority)) ? Number(value.priority) : fallbackIndex,
      });
    };
    intent.missingInformation.forEach(add);
    (readiness?.missingRequired || []).forEach((entry, index) => add({ ...entry, required: true }, 100 + index));
    blockingReviewFields(review).forEach((entry, index) => add({
      field: entry.field,
      label: FIELD_LABELS[entry.field] || entry.field,
      reason: "Обязательное значение ещё не подтверждено",
      required: true,
      priority: 200 + index,
    }, 200 + index));
    if (!values.length && semantic.present && semantic.valid && semantic.result?.garment?.type === "unknown") add({ field: "garmentType", label: "вид изделия", required: true }, 10);
    const seen = new Set();
    return values.sort((a, b) => a.priority - b.priority || lexical(a.field, b.field)).filter((item) => !seen.has(item.field) && seen.add(item.field));
  }

  function selectNextQuestion(input = {}) {
    const answered = new Set((input.answered || []).map((entry) => clean(entry.questionId || entry.field, 100)));
    const candidates = [];
    (Array.isArray(input.questions) ? input.questions : []).forEach((question, index) => {
      const id = clean(question?.id || question?.field, 100);
      if (!id || answered.has(id) || !clean(question.text || QUESTION_COPY[question.field], 240)) return;
      candidates.push(normalizeQuestion(question, index));
    });
    (Array.isArray(input.missing) ? input.missing : []).forEach((item, index) => {
      const id = clean(item.field, 100);
      if (!id || answered.has(id)) return;
      candidates.push(normalizeQuestion({ id, field: id, text: QUESTION_COPY[id] || `Уточни: ${item.label}`, required: item.required, priority: item.priority }, 1000 + index));
    });
    const unique = new Map();
    for (const item of candidates.sort((a, b) => a.priority - b.priority || lexical(a.id, b.id) || a.order - b.order)) if (!unique.has(item.id)) unique.set(item.id, item);
    return unique.values().next().value || null;
  }

  function normalizeQuestion(value, order) {
    return {
      id: clean(value.id || value.field, 100), field: clean(value.field || value.id, 80),
      text: clean(value.text || QUESTION_COPY[value.field], 240),
      type: ["radio", "select", "number", "textarea"].includes(value.type) ? value.type : "text",
      options: Array.isArray(value.options) ? value.options.map((entry) => clean(entry?.value ?? entry, 120)).filter(Boolean) : [],
      required: value.required !== false,
      priority: Number.isFinite(Number(value.priority)) ? Number(value.priority) : order,
      order,
    };
  }

  function sourceSummary(input, semantic) {
    const materials = input.importState?.materials || input.patternImport?.materials || input.materials || [];
    const summary = semantic.result?.sourceSummary || {};
    let photo = 0; let chart = 0; let pdf = 0; let text = 0;
    for (const material of materials) {
      const type = clean(material.type || material.kind || material.mediaType).toLowerCase();
      const purpose = clean(material.purpose || input.purposes?.[material.id]).toLowerCase();
      if (type.includes("pdf")) pdf += 1;
      else if (type.includes("text")) text += 1;
      else if (type.includes("image") && ["chart", "scheme", "схема"].includes(purpose)) chart += 1;
      else if (type.includes("image")) photo += 1;
    }
    if (!materials.length) {
      photo = nonNegative(summary.imageFilesCount); pdf = nonNegative(summary.pdfFilesCount);
      text = nonNegative(summary.textFilesCount);
    }
    const rows = [];
    if (photo) rows.push({ kind: "photo", count: photo, label: countLabel(photo, "фотография", "фотографии", "фотографий") });
    if (chart) rows.push({ kind: "chart", count: chart, label: countLabel(chart, "схема", "схемы", "схем") });
    if (pdf) rows.push({ kind: "pdf", count: pdf, label: `${pdf} PDF` });
    if (text) rows.push({ kind: "text", count: text, label: text === 1 ? "Описание пользователя" : `${text} текстовых описания` });
    return rows;
  }

  function countLabel(count, one, few, many) {
    const mod10 = count % 10; const mod100 = count % 100;
    return `${count} ${mod10 === 1 && mod100 !== 11 ? one : mod10 >= 2 && mod10 <= 4 && !(mod100 >= 12 && mod100 <= 14) ? few : many}`;
  }

  function collectConflicts(review, items) {
    const groups = review.groups.filter((group) => group.status === "unresolved").map((group) => ({ id: clean(group.conflictId, 160), message: "Материалы описывают вещь по-разному" }));
    const byField = new Map();
    for (const item of items) {
      if (["yarn", "pattern"].includes(item.field)) continue;
      if (!byField.has(item.field)) byField.set(item.field, new Set());
      byField.get(item.field).add(item.value.toLowerCase());
    }
    for (const [field, values] of byField) {
      const hasUserCorrection = items.some((item) => item.field === field && item.origin === "user");
      if (!hasUserCorrection && values.size > 1 && !groups.some((entry) => entry.id === field)) groups.push({ id: field, message: "Материалы описывают вещь по-разному" });
    }
    return groups;
  }

  function summaryGarment(items, intent, saved) {
    const garment = lastPreferred(items.filter((item) => item.field === "garmentType"));
    const description = saved.corrections.find((item) => item.field === "description")?.value || clean(intent.description || intent.goal, 500);
    if (!garment) return { title: "Пока не удалось точно определить изделие", description: description || "", trust: "unknown", trustLabel: TRUST.unknown };
    return {
      title: garment.trust === "assumed" ? `Похоже, это ${garment.value}` : capitalize(garment.value),
      description: description || "", trust: garment.trust, trustLabel: garment.trustLabel,
    };
  }

  function lastPreferred(items) { return items.findLast?.((item) => item.origin === "user") || items.at(-1) || null; }
  function correctionFields(items) {
    const fields = new Set(items.map((item) => item.field.split(":")[0]));
    return ["garmentType", "description", "goal", ...fields].filter((field, index, values) => values.indexOf(field) === index && FIELD_LABELS[field]).map((field) => ({ field, label: FIELD_LABELS[field] }));
  }

  function recordAnswer(saved, question, value) {
    const normalized = normalizeSaved(saved); const answer = clean(value, 500);
    if (!question?.id || !question?.field || !validAnswer(question, answer)) return normalized;
    const entry = { id: `answer:${clean(question.id, 100)}`, questionId: clean(question.id, 100), field: clean(question.field, 80), value: answer, provenance: "user" };
    normalized.answers = [...normalized.answers.filter((item) => item.id !== entry.id), entry];
    return freeze(normalized);
  }

  function recordCorrection(saved, field, value) {
    const normalized = normalizeSaved(saved); const key = clean(field, 80); const correction = clean(value, 500);
    if (!key || !correction || !FIELD_LABELS[key]) return normalized;
    const previous = normalized.corrections.find((item) => item.field === key);
    if (previous?.value === correction) return freeze(normalized);
    const entry = { id: `correction:${key}`, field: key, value: correction, provenance: "user", revision: (Number(previous?.revision) || 0) + 1 };
    normalized.corrections = [...normalized.corrections.filter((item) => item.field !== key), entry];
    return freeze(normalized);
  }

  function userCanonicalFields(saved, review) {
    const fields = new Set([...saved.answers, ...saved.corrections].map((item) => item.field));
    for (const item of review.items || []) {
      if (item?.decision !== "corrected") continue;
      const field = REVIEW_FIELD_BY_CATEGORY[item.category];
      if (field) fields.add(field);
    }
    return fields;
  }

  function blockingReviewFields(review) {
    if (!review.present || review.confirmed) return [];
    const values = [];
    for (const item of review.items || []) {
      const field = REVIEW_FIELD_BY_CATEGORY[item?.category];
      if (field && item?.decision === "unresolved" && item?.severity === "critical") values.push({ field });
    }
    for (const group of review.groups || []) {
      const field = REVIEW_FIELD_BY_CATEGORY[group?.category];
      if (field && group?.status === "unresolved" && group?.severity === "critical") values.push({ field });
    }
    const seen = new Set();
    return values.filter((item) => !seen.has(item.field) && seen.add(item.field));
  }

  function reviewItemForField(review, field) {
    const items = (review?.reviewedData?.items || review?.items || []).filter((item) =>
      REVIEW_FIELD_BY_CATEGORY[item?.category] === field && item?.decision !== "rejected");
    return items.length === 1 ? items[0] : null;
  }

  function reviewValueForAnswer(field, value) {
    const answer = clean(value, 500);
    if (field !== "technique") return answer;
    const normalized = answer.toLowerCase();
    if (["knitting", "вязание спицами", "спицами"].includes(normalized)) return "knitting";
    return answer;
  }

  function validAnswer(question, value) {
    const answer = clean(value, 500);
    if (!answer || (question?.required !== false && answer.toLowerCase() === "не уверена")) return false;
    if (question?.field === "technique") return reviewValueForAnswer("technique", answer) === "knitting";
    return true;
  }

  function clean(value, maximum = 500) { return typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, maximum) : ""; }
  function nonNegative(value) { const number = Number(value); return Number.isInteger(number) && number >= 0 ? number : 0; }
  function lexical(left, right) { return String(left).localeCompare(String(right), "en"); }
  function record(value) { return Boolean(value) && typeof value === "object" && !Array.isArray(value); }
  function copy(value) { return value === undefined ? undefined : JSON.parse(JSON.stringify(value)); }
  function freeze(value) { if (!value || typeof value !== "object" || Object.isFrozen(value)) return value; Object.freeze(value); Object.values(value).forEach(freeze); return value; }
  function capitalize(value) { const text = clean(value); return text ? text[0].toUpperCase() + text.slice(1) : ""; }

  const api = Object.freeze({ VERSION, TRUST, buildViewModel, selectNextQuestion, recordAnswer, recordCorrection, normalizeSaved, progressSafety, reviewItemForField, reviewValueForAnswer, validAnswer });
  globalObject.YarnAIMaterialUnderstandingExperience = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
