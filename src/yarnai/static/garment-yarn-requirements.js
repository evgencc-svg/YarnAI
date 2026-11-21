"use strict";

(function initializeGarmentYarnRequirements(globalObject) {
  const CONTRACT_TYPE = "GARMENT_YARN_REQUIREMENTS";
  const CONTRACT_VERSION = "GARMENT_YARN_REQUIREMENTS_V1";
  const SCHEMA_VERSION = 1;
  const STATUS_RESOLVED = "resolved";
  const STATUS_UNRESOLVED = "unresolved";
  const REASON_UNRESOLVED = "YARN_REQUIREMENTS_UNRESOLVED";
  const REQUIREMENT_LEVELS = Object.freeze(["required", "conditional", "optional", "informational"]);
  const FINGERPRINT = /^fnv1a32:[0-9a-f]{8}$/;
  const SUPPORTED_CONSTRUCTIONS = Object.freeze({
    "Вязание сверху вниз с рукавами реглан": "top_down_raglan",
    "Вязание отдельными деталями с втачным рукавом": "seamed_set_in_sleeve",
  });

  const REQUIREMENTS = Object.freeze([
    requirement({
      requirementId: "yarn_identity",
      requirementLevel: "required",
      valuePath: "yarn.name",
      valueType: "text",
      unit: "identity",
      labelRu: "Понятное название выбранной пряжи",
      explanationRu: "Укажи производителя и линейку либо другое название, по которому именно эту пряжу можно отличить от другой.",
      reasonRu: "Идентичность пряжи нужна для привязки контрольного образца и последующих расчётных артефактов к тому же материалу.",
      downstreamConsumers: [
        "yarnai_calculation.FabricContext.yarn",
        "yarnai_calculation.gauge.compare_fabric_context.yarn",
        "yarnai_calculation.sleeve_planning.yarn_identity",
      ],
    }),
    requirement({
      requirementId: "strand_count",
      requirementLevel: "required",
      valuePath: "yarn.strandCount",
      valueType: "positive_integer",
      unit: "strand_count",
      labelRu: "Количество нитей, сложенных вместе",
      explanationRu: "Укажи целое число: 1, если вяжешь одной нитью; 2, если двумя одновременно, и так далее.",
      reasonRu: "Количество сложений входит в контекст полотна и проверку применимости контрольного образца. Отдельное текстовое описание не требуется: его можно вывести из этого числа.",
      downstreamConsumers: [
        "yarnai_calculation.FabricContext.strands",
        "yarnai_calculation.validation.fabric_context.strands",
        "yarnai_calculation.gauge.compare_fabric_context.strands",
      ],
    }),
    requirement({
      requirementId: "skein_mass_grams",
      requirementLevel: "optional",
      valuePath: "yarn.skeinMassGrams",
      valueType: "positive_number",
      unit: "g_per_skein",
      labelRu: "Масса мотка",
      explanationRu: "Перепиши массу одного мотка с этикетки в граммах, если она известна.",
      reasonRu: "Текущий расчётный путь не оценивает расход и не блокируется без массы мотка.",
      downstreamConsumers: [],
    }),
    requirement({
      requirementId: "skein_length_meters",
      requirementLevel: "optional",
      valuePath: "yarn.lengthMeters",
      valueType: "positive_number",
      unit: "m_per_skein",
      labelRu: "Длина нити в мотке",
      explanationRu: "Перепиши метраж одного мотка с этикетки, если он известен.",
      reasonRu: "Текущий расчётный путь не рассчитывает расход или замену пряжи, поэтому метраж не блокирует готовность.",
      downstreamConsumers: [],
    }),
    requirement({
      requirementId: "fiber_composition",
      requirementLevel: "optional",
      valuePath: "yarn.composition",
      valueType: "text",
      unit: "text",
      labelRu: "Состав волокна",
      explanationRu: "Укажи состав с этикетки, если он известен; не определяй его по фотографии.",
      reasonRu: "Состав полезен как справка, но текущий deterministic calculation consumer его не использует как blocking input.",
      downstreamConsumers: [],
    }),
    requirement({
      requirementId: "quantity_available_skeins",
      requirementLevel: "optional",
      valuePath: "yarn.quantityAvailable",
      valueType: "positive_number",
      unit: "skeins",
      labelRu: "Имеющееся количество мотков",
      explanationRu: "Укажи число имеющихся мотков, если хочешь сохранить запас в проекте.",
      reasonRu: "Достаточность запаса и количество мотков в этой задаче не рассчитываются, поэтому значение не блокирует подтверждение.",
      downstreamConsumers: [],
    }),
    requirement({
      requirementId: "selection_method",
      requirementLevel: "informational",
      valuePath: null,
      valueType: "resolved_text",
      resolvedValue: "manual_entry",
      unit: "method",
      labelRu: "Способ ввода",
      explanationRu: "В текущей версии пряжа вводится вручную; каталога и автоматического выбора нет.",
      reasonRu: "Это описание маршрута, а не дополнительное поле и не доказательство выбора конкретной пряжи.",
      downstreamConsumers: [],
    }),
    requirement({
      requirementId: "yarn_weight_category",
      requirementLevel: "informational",
      valuePath: null,
      valueType: "not_required",
      unit: "category",
      labelRu: "Категория толщины пряжи",
      explanationRu: "Категория толщины может быть справочной, но текущая готовность определяется фактическим контрольным образцом.",
      reasonRu: "Blocking consumer категории толщины в текущем расчётном пути отсутствует.",
      downstreamConsumers: [],
    }),
    requirement({
      requirementId: "color_and_dye_lot",
      requirementLevel: "informational",
      valuePath: null,
      valueType: "not_required",
      unit: "text",
      labelRu: "Цвет и партия окрашивания",
      explanationRu: "Цвет и dye lot (партия окрашивания) полезны для покупки одинаковых мотков, но не участвуют в готовности расчёта.",
      reasonRu: "Текущий calculation consumer не использует эти сведения как обязательный вход.",
      downstreamConsumers: [],
    }),
    requirement({
      requirementId: "manufacturer_needle_range",
      requirementLevel: "informational",
      valuePath: null,
      valueType: "not_required",
      unit: "mm_range",
      labelRu: "Рекомендованный производителем диапазон спиц",
      explanationRu: "Диапазон на этикетке можно использовать только как ориентир; основные спицы и спицы образца подтверждаются отдельно.",
      reasonRu: "Этикетка не заменяет фактическую плотность и не снимает отдельные needle/gauge blockers.",
      downstreamConsumers: [],
    }),
  ]);

  class GarmentYarnRequirementsError extends Error {
    constructor(code, message, details = {}) {
      super(message);
      this.name = "GarmentYarnRequirementsError";
      this.code = code;
      this.userMessage = message;
      this.details = copy(details);
    }
  }

  function resolveFromTechnologyDecision(handoff) {
    const source = normalizeSource(handoff);
    const constructionIdentity = source.selectedConstructionIdentity === "seamed_set_in_sleeve" ? source.selectedConstructionIdentity : SUPPORTED_CONSTRUCTIONS[source.selectedOptionName] || null;
    if (!source.current || source.decisionStatus !== "confirmed") return unresolvedProfile(source, "Сначала подтверди один ручной способ вязания.");
    if (!constructionIdentity || !sourceComplete(source)) return unresolvedProfile(source, "Подтверждённая технология или её exact binding повреждены. Открой текущий проект заново.");
    const upstream = upstreamSnapshot(source);
    const profileSeed = { contractType: CONTRACT_TYPE, contractVersion: CONTRACT_VERSION, upstream, constructionIdentity };
    const profile = {
      contractType: CONTRACT_TYPE,
      contractVersion: CONTRACT_VERSION,
      schemaVersion: SCHEMA_VERSION,
      profileId: `garment-yarn-requirements:${fnv1a32(profileSeed).replace(/^fnv1a32:/, "")}`,
      status: STATUS_RESOLVED,
      abstain: false,
      reasonCode: null,
      firstAction: "Выбери конкретную пряжу; затем укажи её понятное название и количество сложений нити.",
      constructionIdentity,
      upstream,
      requirements: copy(REQUIREMENTS),
      canonicalNormalization: canonicalNormalization(),
      canonicalFingerprint: "",
    };
    profile.canonicalFingerprint = profileFingerprint(profile);
    requireValidProfile(profile);
    return freeze(profile);
  }

  function unresolvedProfile(source, firstAction) {
    const profile = {
      contractType: CONTRACT_TYPE,
      contractVersion: CONTRACT_VERSION,
      schemaVersion: SCHEMA_VERSION,
      profileId: null,
      status: STATUS_UNRESOLVED,
      abstain: true,
      reasonCode: REASON_UNRESOLVED,
      firstAction,
      constructionIdentity: null,
      upstream: upstreamSnapshot(source),
      requirements: [],
      canonicalNormalization: canonicalNormalization(),
      canonicalFingerprint: "",
    };
    profile.canonicalFingerprint = profileFingerprint(profile);
    return freeze(profile);
  }

  function evaluateProfile(profile, artifact = {}) {
    requireValidProfile(profile);
    if (profile.status !== STATUS_RESOLVED) return freeze({ status: "unresolved", selected: false, items: [], blockers: [], firstAction: profile.firstAction });
    const selected = artifact?.yarn?.selectionStatus === "selected" && nonEmptyText(artifact?.yarn?.name);
    const items = profile.requirements.map((entry) => evaluateRequirement(entry, artifact, selected));
    const blockers = items.filter((entry) => entry.blocks);
    const firstAction = !selected
      ? "Сначала выбери конкретную пряжу. Профиль требований уже определён, но выбор пряжи ещё не сделан."
      : blockers[0]?.suggestedAction || null;
    return freeze({ status: blockers.length ? "missing" : "satisfied", selected, items, blockers, firstAction });
  }

  function evaluateRequirement(entry, artifact, selected) {
    if (entry.requirementLevel === "informational") {
      return { requirementId: entry.requirementId, active: true, status: "informational", blocks: false, normalizedValue: entry.resolvedValue ?? null, suggestedAction: null };
    }
    if (!selected) return { requirementId: entry.requirementId, active: false, status: "pending_selection", blocks: false, normalizedValue: null, suggestedAction: "Сначала выбери конкретную пряжу." };
    const value = valueAt(artifact, entry.valuePath);
    const normalizedValue = normalizeValue(value, entry.valueType);
    const missing = value === null || value === undefined || (typeof value === "string" && value.trim() === "");
    const invalid = !missing && normalizedValue === null;
    const blocks = entry.requirementLevel === "required" && (missing || invalid);
    return {
      requirementId: entry.requirementId,
      active: true,
      status: missing ? "missing" : invalid ? "invalid" : "filled",
      blocks,
      normalizedValue,
      suggestedAction: blocks ? `Заполни: ${entry.labelRu}.` : null,
    };
  }

  function requireValidProfile(profile) {
    if (!profile || profile.contractType !== CONTRACT_TYPE || profile.contractVersion !== CONTRACT_VERSION || profile.schemaVersion !== SCHEMA_VERSION) fail("YARN_REQUIREMENTS_PROFILE_INVALID", "Профиль требований к пряже имеет неподдерживаемую версию.");
    if (![STATUS_RESOLVED, STATUS_UNRESOLVED].includes(profile.status) || profile.abstain !== (profile.status !== STATUS_RESOLVED) || !FINGERPRINT.test(profile.canonicalFingerprint || "") || !Array.isArray(profile.requirements)) fail("YARN_REQUIREMENTS_PROFILE_INVALID", "Статус или fingerprint профиля требований к пряже повреждён.");
    if (profile.status === STATUS_RESOLVED) {
      const expectedConstruction = profile.upstream?.selectedConstructionIdentity === "seamed_set_in_sleeve" ? "seamed_set_in_sleeve" : SUPPORTED_CONSTRUCTIONS[profile.upstream?.selectedOptionName];
      if (!/^garment-yarn-requirements:[0-9a-f]{8}$/.test(profile.profileId || "") || !expectedConstruction || profile.constructionIdentity !== expectedConstruction || !validUpstream(profile.upstream)) fail("YARN_REQUIREMENTS_PROFILE_INVALID", "Профиль требований к пряже не связан с exact подтверждённым решением.");
      const ids = new Set();
      profile.requirements.forEach((entry) => {
        if (!entry || !/^[a-z][a-z0-9_]*$/.test(entry.requirementId || "") || ids.has(entry.requirementId) || !REQUIREMENT_LEVELS.includes(entry.requirementLevel) || !entry.labelRu || !entry.explanationRu || !entry.reasonRu || !entry.unit || !entry.valueType || !Array.isArray(entry.downstreamConsumers) || (entry.requirementLevel === "required" && !entry.downstreamConsumers.length)) fail("YARN_REQUIREMENTS_PROFILE_INVALID", "Требование к пряже повреждено, повторяется или не имеет blocking consumer.");
        ids.add(entry.requirementId);
      });
    }
    if (profileFingerprint(profile) !== profile.canonicalFingerprint) fail("YARN_REQUIREMENTS_PROFILE_FINGERPRINT_MISMATCH", "Профиль требований к пряже не прошёл проверку целостности.");
    return true;
  }

  function compactBinding(profile) {
    requireValidProfile(profile);
    return freeze({
      contractType: profile.contractType,
      contractVersion: profile.contractVersion,
      profileId: profile.profileId,
      profileFingerprint: profile.canonicalFingerprint,
      projectId: profile.upstream.project.id,
      projectRevision: profile.upstream.project.revision,
      analysisId: profile.upstream.analysis.id,
      analysisRevision: profile.upstream.analysis.revision,
      analysisFingerprint: profile.upstream.analysis.fingerprint,
      requestId: profile.upstream.request.id,
      requestFingerprint: profile.upstream.request.fingerprint,
      requestBindingProjectRevision: profile.upstream.request.bindingProjectRevision,
      technologyDecisionId: profile.upstream.technologyDecision.id,
      technologyDecisionRevision: profile.upstream.technologyDecision.revision,
      technologyDecisionFingerprint: profile.upstream.technologyDecision.fingerprint,
      constructionIdentity: profile.constructionIdentity,
    });
  }

  function upstreamSnapshot(source) {
    return {
      project: { id: source.projectId, revision: source.projectRevision },
      analysis: { id: source.analysisId, revision: source.analysisRevision, fingerprint: source.analysisFingerprint, projectId: source.analysisProjectId },
      request: { id: source.requestId, fingerprint: source.requestFingerprint, projectId: source.requestProjectId, bindingProjectRevision: source.requestBindingProjectRevision },
      technologyDecision: { id: source.decisionId, revision: source.decisionRevision, fingerprint: source.decisionFingerprint, projectId: source.decisionProjectId, selectedOptionId: source.selectedOptionId },
      selectedOptionName: source.selectedOptionName,
      ...(source.selectedConstructionIdentity ? { selectedConstructionIdentity: source.selectedConstructionIdentity } : {}),
    };
  }

  function normalizeSource(handoff = {}) {
    return {
      current: handoff.isCurrent === true,
      decisionStatus: handoff.decisionStatus || null,
      projectId: handoff.projectId || null,
      projectRevision: handoff.sourceProjectRevision || null,
      analysisId: handoff.analysisId || null,
      analysisRevision: handoff.analysisRevision || null,
      analysisFingerprint: handoff.sourceAnalysisFingerprint || null,
      analysisProjectId: handoff.analysisProjectId || handoff.projectId || null,
      requestId: handoff.analysisRequestId || null,
      requestFingerprint: handoff.sourceRequestFingerprint || null,
      requestProjectId: handoff.requestProjectId || handoff.projectId || null,
      requestBindingProjectRevision: handoff.requestBindingProjectRevision || handoff.sourceProjectRevision || null,
      decisionId: handoff.technologyDecisionId || null,
      decisionRevision: handoff.technologyDecisionRevision || null,
      decisionFingerprint: handoff.technologyDecisionFingerprint || null,
      decisionProjectId: handoff.technologyDecisionProjectId || handoff.projectId || null,
      selectedOptionId: handoff.selectedOptionId || null,
      selectedOptionName: handoff.selectedOption?.name || null,
      ...(handoff.selectedConstructionIdentity ? { selectedConstructionIdentity: handoff.selectedConstructionIdentity } : {}),
    };
  }

  function sourceComplete(source) { return validUpstream(upstreamSnapshot(source)); }

  function validUpstream(upstream) {
    const project = upstream?.project || {};
    const analysis = upstream?.analysis || {};
    const request = upstream?.request || {};
    const decision = upstream?.technologyDecision || {};
    return Boolean(project.id && Number.isSafeInteger(project.revision) && project.revision > 0
      && analysis.id && Number.isSafeInteger(analysis.revision) && analysis.revision > 0 && FINGERPRINT.test(analysis.fingerprint || "") && analysis.projectId === project.id
      && request.id && FINGERPRINT.test(request.fingerprint || "") && request.projectId === project.id && request.bindingProjectRevision === project.revision
      && decision.id && Number.isSafeInteger(decision.revision) && decision.revision > 0 && FINGERPRINT.test(decision.fingerprint || "") && decision.projectId === project.id && decision.selectedOptionId
      && upstream.selectedOptionName);
  }

  function requirement(value) {
    return freeze({ valuePath: null, resolvedValue: null, downstreamConsumers: [], ...copy(value) });
  }

  function canonicalNormalization() {
    return {
      normalizationVersion: "GARMENT_YARN_REQUIREMENTS_CANONICAL_NORMALIZATION_V1",
      objectKeyOrder: "lexicographic",
      requirementOrder: REQUIREMENTS.map((entry) => entry.requirementId),
      missingValue: null,
      emptyStringIsMissing: true,
      missingNeverBecomesZero: true,
      noImplicitStrandCount: true,
      units: { skeinMassGrams: "g_per_skein", lengthMeters: "m_per_skein", quantityAvailable: "skeins", strandCount: "strand_count" },
    };
  }

  function normalizeValue(value, valueType) {
    if (value === null || value === undefined || (typeof value === "string" && value.trim() === "")) return null;
    if (valueType === "text") return nonEmptyText(value) ? String(value).trim() : null;
    if (valueType === "positive_integer") { const number = Number(value); return Number.isSafeInteger(number) && number > 0 ? number : null; }
    if (valueType === "positive_number") { const number = Number(value); return Number.isFinite(number) && number > 0 ? number : null; }
    return null;
  }

  function nonEmptyText(value) { return typeof value === "string" && value.trim().length > 0; }
  function valueAt(value, path) { return String(path || "").split(".").filter(Boolean).reduce((current, key) => current && typeof current === "object" ? current[key] : null, value); }
  function profileFingerprint(profile) { const core = copy(profile); delete core.canonicalFingerprint; return fnv1a32(core); }
  function fnv1a32(value) { const source = canonicalize(value); let hash = 0x811c9dc5; for (let index = 0; index < source.length; index += 1) { hash ^= source.charCodeAt(index); hash = Math.imul(hash, 0x01000193); } return `fnv1a32:${(hash >>> 0).toString(16).padStart(8, "0")}`; }
  function canonicalize(value) { if (value === undefined) return "undefined"; if (value === null || typeof value !== "object") return JSON.stringify(value); if (Array.isArray(value)) return `[${value.map(canonicalize).join(",")}]`; return `{${Object.keys(value).filter((key) => value[key] !== undefined).sort().map((key) => `${JSON.stringify(key)}:${canonicalize(value[key])}`).join(",")}}`; }
  function copy(value) { return value === undefined ? undefined : JSON.parse(JSON.stringify(value)); }
  function freeze(value) { if (value && typeof value === "object" && !Object.isFrozen(value)) { Object.freeze(value); Object.values(value).forEach(freeze); } return value; }
  function fail(code, message, details = {}) { throw new GarmentYarnRequirementsError(code, message, details); }

  const api = Object.freeze({
    CONTRACT_TYPE, CONTRACT_VERSION, SCHEMA_VERSION, STATUS_RESOLVED, STATUS_UNRESOLVED, REASON_UNRESOLVED,
    REQUIREMENT_LEVELS, SUPPORTED_CONSTRUCTIONS, REQUIREMENTS, GarmentYarnRequirementsError,
    resolveFromTechnologyDecision, evaluateProfile, requireValidProfile, compactBinding, profileFingerprint, canonicalize,
  });
  globalObject.YarnAIGarmentYarnRequirements = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
