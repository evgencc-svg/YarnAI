"use strict";

(function exposePatternTechnologyExperience(globalObject) {
  const VERSION = 1;
  const STATUS = Object.freeze({
    confirmed: "Определено",
    proposed: "Предлагаемый вариант",
    unknown: "Нужно решить",
  });
  const VALUE_LABELS = Object.freeze({
    knitting: "Вязание спицами", crochet: "Вязание крючком", machine_knitting: "Машинное вязание",
    sweater: "Свитер", cardigan: "Кардиган", pullover: "Джемпер", vest: "Жилет", top: "Топ",
    seamed: "Отдельные детали", separate_pieces: "Отдельные детали", pieces: "Отдельные детали",
    seamless: "Цельновязаная конструкция", one_piece: "Цельновязаная конструкция", integrated: "Цельновязаная конструкция",
    top_down: "Сверху вниз", bottom_up: "Снизу вверх", sideways: "Поперёк",
    in_the_round: "По кругу", circular: "По кругу", flat: "Поворотными рядами", rows: "Поворотными рядами",
    raglan: "Реглан", set_in_sleeve: "Втачной рукав", drop_shoulder: "Спущенное плечо",
    circular_yoke: "Круглая кокетка", saddle_shoulder: "Плечо-погон",
    crew_neck: "Круглая горловина", v_neck: "V-образная горловина", boat_neck: "Горловина-лодочка",
    button_band: "Планка для застёжки", no_band: "Без планки", symmetric: "Симметричные детали",
    mattress_stitch: "Матрасный шов", grafting: "Трикотажный шов", three_needle_bind_off: "Закрытие трёх спиц",
    pick_up_stitches: "Набор петель по краю", join_as_you_go: "Соединение в процессе вязания", no_seams: "Без швов",
  });
  const PROPERTY_LABELS = Object.freeze({
    construction_mode: "Конструкция", constructionMode: "Конструкция", method: "Конструкция",
    direction: "Направление", knitting_direction: "Направление", knittingDirection: "Направление",
    knitting_mode: "Способ вязания", knittingMode: "Способ вязания", work_mode: "Способ вязания",
    shoulder: "Плечо", shoulder_type: "Плечо", sleeve: "Рукав", sleeve_type: "Рукав",
    neckline: "Горловина", neckline_type: "Горловина", band: "Планка", assembly: "Сборка",
    symmetry: "Повторяемость", repeat: "Повторяемость",
    craft: "Техника", product: "Изделие", sizes: "Размер", materials: "Материал", yarn: "Пряжа",
    tools: "Инструменты", gauge: "Плотность", components: "Деталь", sections: "Участок детали",
    operations: "Этап работы", rowInstructions: "Этап работы", finishing: "Сборка и отделка",
  });
  const OPERATION_LABELS = Object.freeze({
    cast_on: "Начать деталь и набрать петли", knit: "Связать основной участок", purl: "Связать основной участок",
    work_pattern: "Выполнить основной узор", repeat: "Повторить основной участок", increase: "Сформировать деталь прибавлениями",
    decrease: "Сформировать деталь убавлениями", bind_off: "Завершить деталь", hold_stitches: "Оставить петли открытыми",
    pick_up_stitches: "Набрать петли по краю", join: "Соединить детали", seam: "Выполнить швы", finish: "Выполнить отделку",
  });
  const PART_LABELS = Object.freeze({
    front: "Перед", back: "Спинка", body: "Корпус", left_front: "Левая полочка", right_front: "Правая полочка",
    sleeve: "Рукав", left_sleeve: "Левый рукав", right_sleeve: "Правый рукав", collar: "Воротник",
    neckband: "Бейка горловины", band: "Планка", pocket: "Карман", yoke: "Кокетка", hood: "Капюшон",
  });
  const SOURCE_LABELS = Object.freeze({ photo: "Фотография", image: "Фотография", chart: "Схема", scheme: "Схема",
    pdf: "Загруженное описание", text: "Описание пользователя", analysis: "Подтверждённое понимание изделия",
    instruction: "Существующая инструкция", user: "Пользовательское исправление" });

  function buildViewModel(input = {}) {
    const source = copy(input);
    const project = record(source.project) ? source.project : null;
    const projectId = clean(project?.project_id || source.projectId, 180);
    if (!projectId) return missingProjectModel();
    const safety = progressSafety(source);
    if (!safety.safe) return failureModel(project, projectId, safety.reason);

    const draft = normalizeDraft(source.draft || source.technologyDraft);
    if (!draft.present) return draftMissingModel(project, projectId, source.canBuild !== false, source.inspectionReason);
    if (!draft.valid) return failureModel(project, projectId, "corrupted");
    const review = normalizeReview(source.review || source.technologyReview);
    const saved = normalizeSaved(source.saved || project?.draft_input?.pattern_technology_experience);
    const result = applySavedCorrections(draft.result, saved.corrections);
    const construction = buildConstruction(result, review);
    const parts = buildParts(result, review);
    const sequence = buildWorkSequence(result, parts, review);
    const assembly = buildAssembly(result, review);
    const handoff = buildHandoffSpaces(result);
    const technologyPlan = technologyPlanStatus(result);
    const conflicts = collectConflicts(result, review);
    const alternatives = buildAlternatives(result, review);
    const nextQuestion = selectNextQuestion({ review, draft: result, answered: saved.answers, alternatives, confirmedCraft: scalar(result.craft?.type ?? result.craft?.value) });
    const sources = buildSourceSummary(source, result, review, saved);
    const summary = buildSummary({ result, construction, parts, assembly, review, technologyPlan });
    const readiness = determineReadiness({ draft, review, conflicts, nextQuestion, safety, technologyPlan });
    const nextStep = nextPracticalStep(projectId, source.projectReadiness || source.readiness);
    const correctionFields = buildCorrectionFields(construction, parts, sequence, assembly);
    const binding = { ...draft.binding, draftRecordCount: positiveInteger(source.draftRecordCount) };

    return freeze({
      version: VERSION, state: "ready", project: { id: projectId, title: clean(project?.title, 180) || "Проект" },
      heading: "Как будем вязать эту вещь",
      lead: "YarnAI предлагает общий способ работы. Проверь его до расчётов и пошаговых инструкций.",
      summary, construction, parts, sequence, assembly, handoff, binding, technologyPlan, alternatives, conflicts, nextQuestion, sources,
      statuses: Object.entries(STATUS).map(([key, label]) => ({ key, label })),
      correctionFields, saved, readiness, nextStep,
      continueAction: {
        enabled: readiness.ready,
        label: review.confirmed ? "Перейти к параметрам" : "Подтвердить способ вязания",
        href: nextStep.href,
      },
      links: {
        analysis: `/pattern-analysis?project=${encodeURIComponent(projectId)}`,
        workshop: "/",
      },
      warning: source.hasDownstream === true ? "После изменения способа вязания расчёты нужно будет построить заново." : "",
      error: null,
    });
  }

  function normalizeDraft(value) {
    if (!value) return { present: false, valid: true, result: null, ready: false, stale: false };
    const isState = record(value) && Object.prototype.hasOwnProperty.call(value, "draftResult");
    const state = isState ? value : { status: "ready", draftResult: value };
    const result = state.draftResult;
    const stale = state.status === "stale" || state.stale === true;
    if (!record(result) && ["waiting", "building", "failed"].includes(state.status)) return { present: false, valid: true, result: null, ready: false, stale, status: clean(state.status) };
    const arrays = ["construction", "components", "sections", "operations", "finishing", "conflicts", "missingInformation"];
    const valid = record(result) && arrays.some((field) => Array.isArray(result[field])) &&
      arrays.every((field) => result[field] === undefined || Array.isArray(result[field]));
    const binding = {
      stage20Revision: positiveInteger(state.revision),
      inputContractVersion: positiveInteger(result?.inputContractVersion),
      sourceReviewId: clean(state.sourceReviewId || result?.provenance?.sourceReviewId, 180),
      sourceReviewRevision: positiveInteger(state.sourceReviewRevision || result?.provenance?.sourceReviewRevision),
      resultIdentity: clean(result?.resultIdentity, 180),
      sourceProjectionFingerprint: clean(state.sourceProjectionFingerprint || result?.sourceProjectionFingerprint, 180),
    };
    return { present: true, valid, result: valid ? copy(result) : null, binding, ready: ["ready", "needs_attention"].includes(state.status || "ready"), stale, status: clean(state.status) };
  }

  function normalizeReview(value) {
    if (!record(value)) return { present: false, valid: true, confirmed: false, canConfirm: false, status: "", decisions: [], corrections: [], targets: [], unresolved: [], notes: [] };
    const targets = Array.isArray(value.reviewState?.targets) ? copy(value.reviewState.targets) : [];
    const decisions = Array.isArray(value.decisions) ? copy(value.decisions) : [];
    const valid = (!value.kind || value.kind === "PATTERN_TECHNOLOGY_REVIEW") && targets.every(record) && decisions.every(record);
    return {
      present: true, valid, confirmed: value.status === "confirmed" && record(value.confirmedSnapshot),
      canConfirm: value.validation?.canConfirm === true, status: clean(value.status), targets, decisions,
      corrections: Array.isArray(value.corrections) ? copy(value.corrections) : [],
      unresolved: Array.isArray(value.unresolvedItems) ? copy(value.unresolvedItems) : [],
      notes: Array.isArray(value.userNotes) ? copy(value.userNotes) : [],
    };
  }

  function normalizeSaved(value) {
    const source = record(value) ? copy(value) : {};
    return freeze({ version: VERSION,
      answers: array(source.answers).filter(validUserEntry),
      corrections: array(source.corrections).filter(validUserEntry),
    });
  }

  function validUserEntry(entry) {
    return record(entry) && clean(entry.id, 180) && clean(entry.field, 100) && entry.provenance === "user" && clean(entry.value, 1000);
  }

  function applySavedCorrections(result, corrections) {
    const next = copy(result);
    for (const correction of corrections) {
      if (correction.field === "construction") next.experienceConstruction = correction.value;
      else if (correction.field === "direction") next.experienceDirection = correction.value;
      else if (correction.field === "knittingMode") next.experienceKnittingMode = correction.value;
      else if (correction.field === "parts") next.experienceParts = correction.value.split(/[,;\n]/).map((item) => clean(item, 120)).filter(Boolean);
      else if (correction.field === "sequence") next.experienceSequence = correction.value.split(/\n|;/).map((item) => clean(item, 240)).filter(Boolean);
      else if (correction.field === "assembly") next.experienceAssembly = correction.value;
      else if (correction.field === "preference") next.experiencePreference = correction.value;
    }
    return next;
  }

  function buildConstruction(result, review) {
    const items = [];
    const add = (property, raw, targetId = "", order = items.length) => {
      const value = scalar(raw);
      if (!value || unknown(value)) return;
      const label = PROPERTY_LABELS[property] || humanize(property) || "Конструкция";
      items.push({ id: clean(targetId, 180) || `construction-${order}`, label, value: valueLabel(value), status: targetStatus(review, targetId), statusLabel: STATUS[targetStatus(review, targetId)], order });
    };
    array(result.construction).forEach((entry, index) => add(entry?.property || entry?.type || `property-${index}`, entry?.value ?? entry, entry?.id, index));
    const flexible = [
      ["construction_mode", result.constructionMode ?? result.construction_mode ?? result.experienceConstruction],
      ["direction", result.direction ?? result.knittingDirection ?? result.experienceDirection],
      ["knitting_mode", result.knittingMode ?? result.workMode ?? result.experienceKnittingMode],
      ["shoulder", result.shoulderType], ["sleeve", result.sleeveType], ["neckline", result.necklineType], ["band", result.bandType], ["assembly", result.assemblyMode],
    ];
    flexible.forEach(([property, value], index) => { if (value !== undefined) add(property, value, "", 100 + index); });
    return stableUnique(items, (item) => `${item.label}|${item.value}`);
  }

  function buildParts(result, review) {
    const raw = result.experienceParts || result.parts || result.components || [];
    const items = [];
    array(raw).forEach((entry, index) => {
      if (!record(entry) && !clean(String(entry || ""), 120)) return;
      const name = clean(record(entry) ? entry.name || entry.title || scalar(entry.value) : String(entry), 120);
      if (!name || unknown(name) || name.toLowerCase().includes("unassigned")) return;
      const quantity = positiveInteger(record(entry) ? entry.quantity ?? entry.count : 1) || 1;
      const direction = record(entry) ? valueLabel(scalar(entry.direction)) : "";
      const mode = record(entry) ? valueLabel(scalar(entry.mode || entry.knittingMode)) : "";
      const targetId = record(entry) ? clean(entry.id, 180) : "";
      const status = targetStatus(review, targetId);
      items.push({ id: targetId || `part-${index}`, name: partLabel(name), quantity, direction: unknown(direction) ? "" : direction, mode: unknown(mode) ? "" : mode,
        relation: clean(record(entry) ? entry.relation || entry.connectedTo : "", 180), status, statusLabel: STATUS[status], order: finite(record(entry) ? entry.order : index, index) });
    });
    return stableUnique(items.sort(orderThenId), (item) => `${item.name.toLowerCase()}|${item.direction}|${item.mode}`)
      .map((item) => ({ ...item, displayName: item.quantity > 1 ? `${item.quantity} × ${item.name}` : item.name }));
  }

  function buildWorkSequence(result, parts, review) {
    const raw = result.experienceSequence || result.workSequence || result.operations || [];
    const items = [];
    array(raw).forEach((entry, index) => {
      const type = clean(record(entry) ? entry.type : "", 80).toLowerCase();
      const source = clean(record(entry) ? entry.instructionSource || entry.instructionText || entry.title || entry.name : String(entry || ""), 280);
      const label = OPERATION_LABELS[type] || source;
      if (!label || unknown(label) || type === "unknown") return;
      const targetId = record(entry) ? clean(entry.id, 180) : "";
      const status = targetStatus(review, targetId);
      items.push({ id: targetId || `step-${index}`, label: sentence(label), part: partForOperation(entry, parts), status, statusLabel: STATUS[status], order: finite(record(entry) ? entry.order : index, index) });
    });
    return stableUnique(items.sort(orderThenId), (item) => `${item.part}|${item.label.toLowerCase()}`).map((item, index) => ({ ...item, number: index + 1 }));
  }

  function buildAssembly(result, review) {
    const raw = result.assembly || result.finishing || [];
    const items = [];
    array(raw).forEach((entry, index) => {
      const type = clean(record(entry) ? entry.type : "", 80).toLowerCase();
      if (type && !["join", "seam", "finish", "pick_up_stitches", "no_seams"].includes(type)) return;
      const value = clean(record(entry) ? entry.instructionText || entry.name || entry.value || OPERATION_LABELS[type] : String(entry || ""), 240);
      if (!value || unknown(value)) return;
      const targetId = record(entry) ? clean(entry.id || entry.operationId, 180) : "";
      const status = targetStatus(review, targetId);
      items.push({ id: targetId || `assembly-${index}`, label: sentence(valueLabel(value)), status, statusLabel: STATUS[status], order: finite(record(entry) ? entry.order : index, index) });
    });
    if (result.experienceAssembly) items.unshift({ id: "assembly-user", label: sentence(result.experienceAssembly), status: "confirmed", statusLabel: STATUS.confirmed, order: -1 });
    const noSeams = [result.assemblyMode, result.knittingMode, ...array(result.construction).map((entry) => scalar(entry?.value))].some((value) => ["no_seams", "seamless"].includes(normalizeToken(value)));
    if (!items.length && noSeams) items.push({ id: "assembly-none", label: "Изделие выполняется без швов", status: "proposed", statusLabel: STATUS.proposed, order: 0 });
    return stableUnique(items.sort(orderThenId), (item) => item.label.toLowerCase());
  }

  function buildSummary({ result, construction, parts, assembly, review, technologyPlan }) {
    const mode = findConstruction(construction, "Конструкция");
    const direction = findConstruction(construction, "Направление");
    const workMode = findConstruction(construction, "Способ вязания");
    const phrases = [];
    if (mode) phrases.push(({ "Отдельные детали": "отдельными деталями", "Цельновязаная конструкция": "цельновязаным способом" })[mode] || lowerFirst(mode));
    else if (parts.length > 1) phrases.push("отдельными деталями");
    if (direction) phrases.push(lowerFirst(direction));
    if (workMode) phrases.push(lowerFirst(workMode));
    let text = phrases.length ? `Предлагаю вязать изделие ${phrases.join(", ")}.` : technologyPlan?.built ? "Общий способ вязания собран из подтверждённого разбора материалов." : "Источник и профиль адаптации подтверждены и переданы раздельно. Полный технологический план ещё не построен.";
    if (assembly.length && !/без швов/i.test(assembly[0].label)) text += " Затем выполнить соединение и отделку, указанные в плане.";
    const provisional = !review.confirmed || construction.some((item) => item.status !== "confirmed");
    return { text, status: provisional ? "proposed" : "confirmed", statusLabel: provisional ? "Предварительный вариант" : STATUS.confirmed,
      preference: clean(result?.experiencePreference, 300) };
  }

  function buildAlternatives(result, review) {
    const values = [];
    array(result.alternatives).forEach((entry, index) => values.push(normalizeAlternative(entry, index)));
    for (const target of review.targets) {
      array(target.conflictValues).forEach((value, index) => values.push(normalizeAlternative({ value, targetId: target.id, order: 1000 + index }, 1000 + index)));
    }
    return stableUnique(values.filter((item) => item.label), (item) => item.label.toLowerCase()).sort(orderThenId);
  }

  function normalizeAlternative(entry, index) {
    const source = record(entry) ? entry : { value: entry };
    return { id: clean(source.id || source.targetId, 180) || `alternative-${index}`, label: valueLabel(scalar(source.value ?? source.label ?? source.name)),
      change: clean(source.change || source.description, 240), benefit: clean(source.benefit, 180), limitation: clean(source.limitation, 180),
      recalculation: source.requiresRecalculation === true, order: finite(source.order, index) };
  }

  function selectNextQuestion(input = {}) {
    const review = normalizeReviewInput(input.review);
    const answered = new Set(array(input.answered).map((entry) => clean(entry.questionId || entry.field || entry.id, 180)));
    const decisions = new Map(review.decisions.map((entry) => [entry.targetId, entry]));
    const candidates = [];
    review.targets.forEach((target, index) => {
      const decision = decisions.get(target.id);
      if (["craft", "technique"].includes(target?.category) && normalizeToken(input.confirmedCraft) === "knitting") return;
      if (!target?.id || answered.has(target.id) || !record(target) || (decision && !["pending", "unresolved"].includes(decision.decision))) return;
      const original = valueLabel(scalar(target.originalValue));
      const conflictOptions = array(target.conflictValues).map(valueLabel).filter((value) => value && !unknown(value));
      candidates.push({
        id: target.id, targetId: target.id, field: target.category || "technology", required: target.blocking !== false,
        text: questionText(target, original), options: conflictOptions.length ? conflictOptions : original ? [original, "Нужно изменить"] : ["Подтвердить", "Нужно изменить"],
        priority: target.blocking === false ? 1000 : 0, order: finite(target.priority, index), correctionTypes: array(target.allowedCorrections), original,
      });
    });
    array(input.draft?.missingInformation).forEach((entry, index) => {
      if (["MISSING_OPERATIONS", "MISSING_FINISHING"].includes(entry?.code)) return;
      if (entry?.code === "MISSING_CRAFT" && normalizeToken(input.confirmedCraft) === "knitting") return;
      const id = clean(entry?.id || entry?.code, 180); if (!id || answered.has(id) || candidates.some((item) => item.id === id)) return;
      candidates.push({ id, targetId: id, field: "missing", required: entry?.level === "critical", text: missingQuestion(entry), options: array(entry?.values).map(valueLabel).filter(Boolean), priority: entry?.level === "critical" ? 10 : 1010, order: 2000 + index, correctionTypes: [] });
    });
    return candidates.sort((a, b) => a.priority - b.priority || a.order - b.order || lexical(a.id, b.id))[0] || null;
  }

  function determineReadiness({ draft, review, conflicts, nextQuestion, safety, technologyPlan }) {
    const reasons = [];
    if (!safety.safe) reasons.push("Запись требует повторной проверки");
    if (!draft.valid || !draft.ready || draft.stale) reasons.push("Способ вязания пока не готов");
    if (!review.valid) reasons.push("Проверка повреждена");
    if (conflicts.length) reasons.push("Нужно устранить несовместимые варианты");
    if (nextQuestion?.required) reasons.push("Остался обязательный вопрос");
    if (review.present && !review.confirmed && !review.canConfirm) reasons.push("Проверка ещё не завершена");
    if (technologyPlan && !technologyPlan.built) reasons.push("Технологический план ещё не построен");
    return { ready: reasons.length === 0 && (!review.present || review.confirmed || review.canConfirm), reasons };
  }

  function technologyPlanStatus(result) {
    const counts = { components: array(result.components).length, operations: array(result.operations).length, rows: array(result.rowInstructions).length, finishing: array(result.finishing).length };
    const built = Object.values(counts).every((count) => count > 0);
    return { built, counts, message: built ? "Структурные разделы технологического плана заполнены." : "Подтверждённые параметры переданы, но технологический план ещё не построен: детали, операции, ряды или отделка отсутствуют." };
  }

  function buildHandoffSpaces(result) {
    const source = result.sourcePatternEvidence?.facts || {};
    const profile = result.userAdaptationProfile || {};
    const sourceRows = [];
    const adaptationRows = [];
    const add = (target, label, value) => { const rendered = handoffValue(value); if (rendered) target.push({ label, value: rendered }); };
    add(sourceRows, "Изделие", source.product);
    add(sourceRows, "Техника", source.craft);
    add(sourceRows, "Размеры схемы", source.availableSizes);
    add(sourceRows, "Размер схемы", source.selectedSize);
    add(sourceRows, "Готовая мерка", source.finishedMeasurement);
    add(sourceRows, "Плотность схемы", source.gauge);
    add(sourceRows, "Спицы схемы", source.needles);
    add(sourceRows, "Пряжа схемы", [...array(source.yarnWeight), ...array(source.yarnSamples)]);
    add(sourceRows, "Порядок конструкции", source.construction?.sequence);
    const provenance = result.sourcePatternEvidence?.provenance;
    if (provenance?.authority && provenance?.reviewRevision) add(sourceRows, "Подтверждение Stage 19", `${provenance.authority} · revision ${provenance.reviewRevision}`);
    add(adaptationRows, "Выбранный размер", profile.selectedSize);
    add(adaptationRows, "Плотность адаптации", profile.gauge);
    add(adaptationRows, "Спицы адаптации", profile.needles);
    const adaptationYarn = [...array(profile.yarn?.fibre), ...array(profile.yarn?.weight), ...array(profile.yarn?.lengthOrWeight)];
    add(adaptationRows, "Пряжа адаптации", adaptationYarn.length ? adaptationYarn : array(profile.yarn?.names));
    return { source: sourceRows, adaptation: adaptationRows, sourceFingerprint: clean(result.sourcePatternEvidence?.fingerprint, 180), adaptationFingerprint: clean(profile.fingerprint, 180) };
  }

  function handoffValue(value) {
    if (value === null || value === undefined || value === "") return "";
    if (Array.isArray(value)) return value.map(handoffValue).filter(Boolean).join(", ");
    if (!record(value)) return valueLabel(value);
    if (value.sizeLabel && (value.in || value.cm)) return `${value.sizeLabel}: ${value.in ?? "—"} in / ${value.cm ?? "—"} cm`;
    if ((value.stitches || value.rows || value.rounds) && value.per) return `${value.stitches ? `${value.stitches} п.` : ""}${value.rows ? ` + ${value.rows} р.` : ""}${value.rounds ? ` + ${value.rounds} круг. р.` : ""} на ${value.per} ${value.unit || ""}`.trim();
    if (value.canonicalValue !== undefined) return `${handoffValue(value.canonicalValue)}${value.unit ? ` ${value.unit}` : ""}`;
    if (value.value !== undefined) return `${handoffValue(value.value)}${value.unit ? ` ${value.unit}` : ""}`;
    return Object.entries(value).filter(([key]) => !["evidence", "confidence", "status", "recognitionReason", "pairId", "rawText", "rawValue", "rawUnit", "condition", "equivalentMentions"].includes(key)).map(([key, item]) => `${humanize(key)}: ${handoffValue(item)}`).filter((entry) => !entry.endsWith(": ")).join("; ");
  }

  function collectConflicts(result, review) {
    const values = [];
    array(result.conflicts).forEach((entry, index) => {
      if (entry?.resolved === true) return;
      values.push({ id: clean(entry?.id || entry?.code, 180) || `conflict-${index}`, title: "Есть несколько несовместимых вариантов", message: "Нужно выбрать, какой способ использовать.", options: array(entry?.values).map(valueLabel).filter(Boolean) });
    });
    review.unresolved.filter((entry) => entry.blocking !== false).forEach((entry, index) => values.push({ id: clean(entry.targetId, 180) || `review-conflict-${index}`, title: "Есть несколько несовместимых вариантов", message: "Нужно выбрать, какой способ использовать.", options: [] }));
    return stableUnique(values, (item) => item.id);
  }

  function buildSourceSummary(source, result, review, saved) {
    const rows = [];
    const add = (kind, label, count = 1) => { if (count > 0 && !rows.some((row) => row.kind === kind)) rows.push({ kind, label: count > 1 ? `${label}: ${count}` : label }); };
    array(source.materials || source.importState?.materials).forEach((item) => {
      const kind = normalizeToken(item?.purpose || item?.type || item?.kind); add(kind, SOURCE_LABELS[kind] || "Загруженный материал");
    });
    const summary = source.semantic?.result?.sourceSummary || source.sourceSummary || {};
    add("photo", SOURCE_LABELS.photo, nonNegative(summary.imageFilesCount)); add("pdf", SOURCE_LABELS.pdf, nonNegative(summary.pdfFilesCount)); add("text", SOURCE_LABELS.text, nonNegative(summary.textFilesCount));
    if (array(result.provenance).length) add("analysis", SOURCE_LABELS.analysis);
    if (review.corrections.length || saved.corrections.length) add("user", SOURCE_LABELS.user);
    if (!rows.length) add("analysis", SOURCE_LABELS.analysis);
    return rows;
  }

  function buildCorrectionFields(construction, parts, sequence, assembly) {
    const fields = [
      ["construction", "Способ изготовления", true], ["direction", "Направление вязания", true],
      ["knittingMode", "По кругу или рядами", true], ["parts", "Состав деталей", true],
      ["sequence", "Порядок крупных этапов", true], ["assembly", "Способ сборки", true], ["preference", "Ключевое пожелание", true],
    ];
    return fields.filter(([, , present]) => present).map(([field, label]) => ({ field, label }));
  }

  function nextPracticalStep(projectId, readiness) {
    const encoded = encodeURIComponent(projectId);
    if (readiness?.status === "ready_for_calculation" && clean(readiness?.nextAction?.href, 1000).startsWith("/calculator")) {
      return { kind: "calculation", title: "Расчёты", description: "Параметры и плотность уже готовы — можно перейти к расчёту.", href: readiness.nextAction.href };
    }
    if (readiness?.status === "ready_for_sample") return { kind: "sample", title: "Контрольный образец и плотность", description: "Дальше понадобится связать образец и определить плотность.", href: `/user-workspace-entry?project=${encoded}#swatch-assistant` };
    return { kind: "parameters", title: "Размер, мерки и плотность", description: "После подтверждения YarnAI попросит размер или мерки и поможет определить плотность.", href: `/user-workspace-entry?project=${encoded}#project-details` };
  }

  function progressSafety(input) {
    if (input.storageError) return { safe: false, reason: "storage" };
    for (const progress of [input.draftProgress, input.reviewProgress, input.progressRecord].filter(Boolean)) {
      if (!record(progress) || progress.epoch !== undefined && progress.epoch !== 1) return { safe: false, reason: "stale" };
      if (progress.quarantined || progress.quarantine_id) return { safe: false, reason: "quarantined" };
      if (progress.collided || progress.conflict_id) return { safe: false, reason: "collided" };
      if (progress.imported_unproven || progress.imported === true && progress.proven === false) return { safe: false, reason: "imported" };
    }
    const state = clean(input.inspectionState || input.stateName).toLowerCase();
    if (["stale", "corrupted", "quarantined", "collided", "source_invalid"].includes(state)) return { safe: false, reason: state };
    return { safe: true, reason: null };
  }

  function recordAnswer(saved, question, value) {
    const next = copy(normalizeSaved(saved)); const text = clean(value, 1000); const id = clean(question?.id, 180);
    if (!id || !text) return freeze(next);
    const entry = { id: `answer:${id}`, questionId: id, field: clean(question.field || "technology", 100), value: text, provenance: "user", revision: (next.answers.find((item) => item.questionId === id)?.revision || 0) + 1 };
    next.answers = [...next.answers.filter((item) => item.questionId !== id), entry]; return freeze(next);
  }

  function recordCorrection(saved, field, value) {
    const next = copy(normalizeSaved(saved)); const key = clean(field, 100); const text = clean(value, 1000);
    if (!key || !text) return freeze(next);
    const previous = next.corrections.find((item) => item.field === key);
    const entry = { id: `correction:${key}`, field: key, value: text, provenance: "user", revision: (previous?.revision || 0) + 1 };
    next.corrections = [...next.corrections.filter((item) => item.field !== key), entry]; return freeze(next);
  }

  function targetStatus(review, targetId) {
    if (!review.present) return "proposed";
    if (!targetId) return review.confirmed ? "confirmed" : "proposed";
    const decision = review.decisions.find((entry) => entry.targetId === targetId)?.decision;
    if (["accepted", "corrected"].includes(decision) || review.confirmed) return "confirmed";
    if (["pending"].includes(decision)) return "proposed";
    return "unknown";
  }

  function normalizeReviewInput(value) { return value?.targets && value?.decisions ? value : normalizeReview(value); }
  function questionText(target, original) {
    if (target.targetKind === "finding" || target.category === "conflict") return "Какой вариант способа вязания используем?";
    const label = PROPERTY_LABELS[target.category] || humanize(target.category) || "решение";
    return original ? `${label}: оставить «${original}»?` : `Нужно уточнить: ${lowerFirst(label)}?`;
  }
  function missingQuestion(entry) { return clean(entry?.question, 240) || ({ MISSING_FINISHING: "Как будем соединять и отделывать детали?", UNASSIGNED_COMPONENT: "К какой детали относится этот участок?" })[entry?.code] || "Что нужно уточнить в способе вязания?"; }
  function failureModel(project, projectId, reason) { const storage = reason === "storage"; return freeze({ version: VERSION, state: "error", project: { id: projectId, title: clean(project?.title, 180) || "Проект" }, heading: storage ? "Не удалось открыть способ вязания" : "Пока не удалось подготовить способ вязания", lead: storage ? "Попробуй обновить страницу." : "Вернись к разбору материалов и проверь обязательные сведения.", error: { reason }, links: { analysis: `/pattern-analysis?project=${encodeURIComponent(projectId)}`, workshop: "/" }, continueAction: { enabled: false, label: "Подтвердить способ вязания", href: "" } }); }
  function draftMissingModel(project, projectId, canBuild, inspectionReason) { return freeze({ version: VERSION, state: canBuild ? "loading" : "error", project: { id: projectId, title: clean(project?.title, 180) || "Проект" }, heading: canBuild ? "Готовим способ вязания" : "Пока не удалось подготовить способ вязания", lead: canBuild ? "Собираем общий порядок работы из подтверждённого разбора." : "Вернись к разбору и проверь материалы.", links: { analysis: `/pattern-analysis?project=${encodeURIComponent(projectId)}`, workshop: "/" }, continueAction: { enabled: false, label: "Подтвердить способ вязания", href: "" }, error: canBuild ? null : { reason: clean(inspectionReason, 100) || "missing" } }); }
  function missingProjectModel() { return freeze({ version: VERSION, state: "missing_project", project: null, heading: "Проект не найден", lead: "Вернись в мастерскую и выбери проект заново.", links: { analysis: "/pattern-analysis", workshop: "/" }, continueAction: { enabled: false, label: "Подтвердить способ вязания", href: "/" }, error: null }); }

  function scalar(value) { if (record(value)) return value.value ?? value.type ?? value.name ?? value.title ?? value.label ?? value.text ?? value.instructionText ?? ""; return value ?? ""; }
  function valueLabel(value) { const text = clean(String(value ?? ""), 240); return VALUE_LABELS[normalizeToken(text)] || text; }
  function partLabel(value) { const token = normalizeToken(value); return PART_LABELS[token] || sentence(value); }
  function normalizeToken(value) { return clean(String(value ?? ""), 180).toLowerCase().replace(/[\s-]+/g, "_"); }
  function unknown(value) { return !clean(String(value ?? "")) || ["unknown", "ambiguous", "undefined", "null", "неизвестно"].includes(normalizeToken(value)); }
  function humanize(value) { return sentence(clean(String(value || "")).replace(/[_-]+/g, " ")); }
  function sentence(value) { const text = clean(String(value || ""), 280); return text ? text[0].toUpperCase() + text.slice(1) : ""; }
  function lowerFirst(value) { const text = clean(String(value || "")); return text ? text[0].toLowerCase() + text.slice(1) : ""; }
  function findConstruction(items, label) { return items.find((item) => item.label === label)?.value || ""; }
  function partForOperation(entry, parts) { const id = clean(record(entry) ? entry.componentId || entry.partId : "", 180); return parts.find((part) => part.id === id)?.name || ""; }
  function orderThenId(left, right) { return finite(left.order, 0) - finite(right.order, 0) || lexical(left.id, right.id); }
  function stableUnique(items, keyOf) { const seen = new Set(); return items.filter((item) => { const key = keyOf(item); if (!key || seen.has(key)) return false; seen.add(key); return true; }); }
  function clean(value, maximum = 500) { return typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, maximum) : ""; }
  function finite(value, fallback) { const number = Number(value); return Number.isFinite(number) ? number : fallback; }
  function positiveInteger(value) { const number = Number(value); return Number.isInteger(number) && number > 0 ? number : null; }
  function nonNegative(value) { const number = Number(value); return Number.isInteger(number) && number >= 0 ? number : 0; }
  function lexical(left, right) { return String(left).localeCompare(String(right), "en"); }
  function record(value) { return Boolean(value) && typeof value === "object" && !Array.isArray(value); }
  function array(value) { return Array.isArray(value) ? value : []; }
  function copy(value) { return value === undefined ? undefined : JSON.parse(JSON.stringify(value)); }
  function freeze(value) { if (!value || typeof value !== "object" || Object.isFrozen(value)) return value; Object.freeze(value); Object.values(value).forEach(freeze); return value; }

  const api = Object.freeze({ VERSION, STATUS, VALUE_LABELS, normalizeDraft, normalizeReview, normalizeSaved, buildViewModel, buildConstruction, buildParts, buildWorkSequence, buildAssembly, buildAlternatives, buildSourceSummary, buildHandoffSpaces, technologyPlanStatus, selectNextQuestion, determineReadiness, progressSafety, recordAnswer, recordCorrection, nextPracticalStep });
  globalObject.YarnAIPatternTechnologyExperience = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
