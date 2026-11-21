"use strict";

(function initializeGarmentYarnTargetDecision(globalObject) {
  const CONTRACT_VERSION = "GARMENT_YARN_TARGET_DECISION_V1";
  const PROGRESS_KIND = "GARMENT_YARN_TARGET_DECISION";
  const OWNER_INTENTS = Object.freeze({
    MAXIMUM_PHOTO_SIMILARITY: "MAXIMUM_PHOTO_SIMILARITY",
    OWNER_SELECTED_TARGET: "OWNER_SELECTED_TARGET",
  });
  const STATUSES = Object.freeze(["ready_to_choose", "ready_to_confirm", "confirmed", "stale", "failed"]);
  const OPTION_FIELDS = Object.freeze([
    Object.freeze({ field: "thinnerAlternative", optionId: "thinner" }),
    Object.freeze({ field: "recommendedMiddle", optionId: "recommended_middle" }),
    Object.freeze({ field: "thickerAlternative", optionId: "thicker" }),
  ]);
  const FINGERPRINT = /^fnv1a32:[0-9a-f]{8}$/;
  const CLOSEST_MARKER = /(?:(?:^|\s)(?:наиболее|максимально)\s+близ[а-яё]*|(?:^|\s)ближ[а-яё]*\s+всего)/iu;

  function copy(value) { return value === undefined ? undefined : JSON.parse(JSON.stringify(value)); }
  function freeze(value) { if (value && typeof value === "object" && !Object.isFrozen(value)) { Object.values(value).forEach(freeze); Object.freeze(value); } return value; }
  function canonicalize(value) { if (Array.isArray(value)) return `[${value.map(canonicalize).join(",")}]`; if (value && typeof value === "object") return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalize(value[key])}`).join(",")}}`; return JSON.stringify(value); }
  function fnv1a32(value) { const bytes = new TextEncoder().encode(canonicalize(value)); let hash = 0x811c9dc5; for (const byte of bytes) { hash ^= byte; hash = Math.imul(hash, 0x01000193) >>> 0; } return `fnv1a32:${hash.toString(16).padStart(8, "0")}`; }
  function fail(code, message) { const error = new Error(message); error.code = code; error.userMessage = message; throw error; }
  function exactObject(value, keys, code = "TARGET_DECISION_SCHEMA_INVALID") { if (!value || typeof value !== "object" || Array.isArray(value) || Object.keys(value).sort().join("|") !== [...keys].sort().join("|")) fail(code, "Структура решения о целевой пряже повреждена."); return value; }
  function nonEmpty(value, code = "TARGET_DECISION_SCHEMA_INVALID") { if (typeof value !== "string" || !value.trim()) fail(code, "Обязательное текстовое поле решения не заполнено."); return value.trim(); }
  function positiveInteger(value, code = "TARGET_DECISION_SCHEMA_INVALID") { if (!Number.isSafeInteger(value) || value < 1) fail(code, "Revision решения или upstream-объекта повреждён."); return value; }
  function timestamp(value, nullable = false) { if (nullable && value === null) return null; if (typeof value !== "string" || !Number.isFinite(Date.parse(value))) fail("TARGET_DECISION_TIME_INVALID", "Время решения повреждено."); return value; }
  function now(value) { return timestamp(value || new Date().toISOString()); }
  function fingerprint(value) { if (!FINGERPRINT.test(value || "")) fail("TARGET_DECISION_UPSTREAM_INVALID", "Upstream fingerprint отсутствует или повреждён."); return value; }

  function recommendationDomain() {
    const domain = globalObject.YarnAIGarmentYarnRecommendation;
    if (!domain) fail("TARGET_DECISION_SOURCE_UNAVAILABLE", "Модуль сохранённой рекомендации недоступен.");
    return domain;
  }

  function requireRecommendation(recommendation) {
    recommendationDomain().validateCurrentArtifact(recommendation, recommendation.sourceBindings);
    return recommendation;
  }

  function optionModels(recommendation) {
    requireRecommendation(recommendation);
    const options = OPTION_FIELDS.map(({ field, optionId }) => {
      const variant = recommendation[field];
      if (!variant || variant.kind !== optionId) fail("TARGET_DECISION_OPTION_INVALID", "Сохранённый вариант рекомендации имеет неверную identity.");
      return freeze({ optionId, sourceField: field, variant: copy(variant), closestEvidence: CLOSEST_MARKER.test(variant.referenceSimilarity || "") });
    });
    return freeze(options);
  }

  function resolveClosestOption(recommendation) {
    const candidates = optionModels(recommendation).filter((entry) => entry.closestEvidence);
    if (candidates.length !== 1) fail("MOST_SIMILAR_OPTION_AMBIGUOUS", "Сохранённая рекомендация не обозначает ровно один вариант как наиболее близкий к фотографии.");
    const candidate = candidates[0];
    return freeze({ optionId: candidate.optionId, sourceField: candidate.sourceField, selectionReason: candidate.variant.referenceSimilarity });
  }

  function selectedOptionSnapshot(recommendation, selectedOptionId) {
    const option = optionModels(recommendation).find((entry) => entry.optionId === selectedOptionId);
    if (!option) fail("UNKNOWN_TARGET_OPTION", "Выбранный вариант отсутствует в текущей рекомендации.");
    const variant = option.variant;
    return freeze({
      optionId: option.optionId,
      sourceField: option.sourceField,
      kind: variant.kind,
      metersPer100g: copy(variant.metersPer100g),
      categoryRu: variant.categoryRu,
      targetStitchesPer10cm: copy(variant.targetStitchesPer10cm),
      targetRowsPer10cm: copy(variant.targetRowsPer10cm),
      rowGaugeUncertainty: variant.rowGaugeUncertainty,
      initialNeedlesMm: copy(variant.initialNeedlesMm),
      strandCount: variant.strandCount,
      surface: variant.surface,
      textureEffect: variant.textureEffect,
      drapeStructure: variant.drapeStructure,
      garmentWeightVolume: variant.garmentWeightVolume,
      trimBehavior: variant.trimBehavior,
      referenceSimilarity: variant.referenceSimilarity,
      risk: variant.risk,
      confidence: variant.confidence,
      basis: copy(variant.basis),
    });
  }

  function contentAddressedId(prefix, value) { return `${prefix}:${fingerprint(value).slice(8)}`; }

  function currentContextFromInspection(recommendationInspected) {
    const aggregate = recommendationInspected?.aggregate;
    const recommendation = recommendationInspected?.artifact;
    if (!aggregate || !recommendation || recommendationInspected.current !== true || recommendationInspected.currentValidation?.semanticValid !== true) fail("TARGET_DECISION_RECOMMENDATION_NOT_CURRENT", "Нужна текущая полностью проверенная сохранённая рекомендация.");
    const intakeKind = globalObject.YarnAIManualCalculationIntake?.PROGRESS_KIND;
    const intakeProgress = aggregate.progress.find((entry) => entry.kind === intakeKind && entry.calculation_id === recommendationInspected.calculation.calculation_id && entry.epoch === 1);
    const intakeState = intakeProgress?.state;
    const intake = intakeState?.intakes?.find((entry) => entry.intakeId === intakeState.activeIntakeId) || intakeState?.intakes?.at(-1);
    const garment = intake?.garmentRequirementsProfile;
    const yarn = intake?.yarnRequirementsProfile;
    if (!intake || !garment || !yarn) fail("TARGET_DECISION_UPSTREAM_MISSING", "Профили требований к изделию или пряже отсутствуют.");
    const source = recommendation.sourceBindings;
    const garmentFingerprint = fingerprint(garment.canonicalFingerprint);
    return freeze({
      recommendation,
      upstream: {
        project: { id: aggregate.project.project_id, revision: aggregate.project.revision },
        analysis: { id: nonEmpty(source.analysis?.id), revision: positiveInteger(source.analysis?.revision), fingerprint: fingerprint(source.analysis?.fingerprint) },
        technologyDecision: { id: nonEmpty(source.technologyDecision?.id), revision: positiveInteger(source.technologyDecision?.revision), fingerprint: fingerprint(source.technologyDecision?.fingerprint) },
        garmentRequirements: { id: contentAddressedId("garment-measurement-requirements", garmentFingerprint), revision: positiveInteger(garment.schemaVersion), fingerprint: garmentFingerprint },
        yarnRequirements: { id: nonEmpty(yarn.profileId), revision: positiveInteger(yarn.schemaVersion), fingerprint: fingerprint(yarn.canonicalFingerprint) },
        yarnRecommendation: { id: recommendation.recommendationId, revision: positiveInteger(recommendation.revision), fingerprint: fingerprint(recommendation.canonicalFingerprint) },
      },
    });
  }

  function normalizeUpstream(value) {
    exactObject(value, ["project", "analysis", "technologyDecision", "garmentRequirements", "yarnRequirements", "yarnRecommendation"]);
    exactObject(value.project, ["id", "revision"]); nonEmpty(value.project.id); positiveInteger(value.project.revision);
    for (const key of ["analysis", "technologyDecision", "garmentRequirements", "yarnRequirements", "yarnRecommendation"]) {
      exactObject(value[key], ["id", "revision", "fingerprint"]); nonEmpty(value[key].id); positiveInteger(value[key].revision); fingerprint(value[key].fingerprint);
    }
    return copy(value);
  }

  function core(value) { const result = copy(value); delete result.canonicalFingerprint; return result; }
  function seal(value) { value.canonicalFingerprint = fnv1a32(core(value)); requireValidArtifact(value); return freeze(value); }

  function createSelection(current, selectedOptionId, options = {}) {
    const recommendation = requireRecommendation(current.recommendation);
    const ownerIntent = options.ownerIntent || OWNER_INTENTS.MAXIMUM_PHOTO_SIMILARITY;
    if (!Object.values(OWNER_INTENTS).includes(ownerIntent)) fail("TARGET_DECISION_OWNER_INTENT_INVALID", "Намерение владельца не поддерживается.");
    const snapshot = selectedOptionSnapshot(recommendation, selectedOptionId);
    const closest = resolveClosestOption(recommendation);
    if (ownerIntent === OWNER_INTENTS.MAXIMUM_PHOTO_SIMILARITY && selectedOptionId !== closest.optionId) fail("TARGET_OPTION_CONFLICTS_WITH_OWNER_INTENT", "Для намерения «максимально похоже» разрешён только вариант, который рекомендация явно называет наиболее близким.");
    const at = now(options.now);
    const upstream = normalizeUpstream(current.upstream);
    const decisionSeed = { projectId: upstream.project.id, recommendationId: upstream.yarnRecommendation.id, contractVersion: CONTRACT_VERSION };
    return seal({
      contractVersion: CONTRACT_VERSION,
      status: "ready_to_confirm",
      decisionId: `garment-yarn-target-decision:${fnv1a32(decisionSeed).slice(8)}`,
      selectedOptionId,
      selectedOptionSnapshot: copy(snapshot),
      selectionReason: snapshot.referenceSimilarity,
      ownerIntent,
      confirmedAt: null,
      revision: 1,
      canonicalFingerprint: "",
      upstream,
      provenance: {
        method: "deterministic_saved_recommendation_selection",
        sourceRecommendationContract: recommendation.contractName,
        selectionEvidencePath: `${snapshot.sourceField}.referenceSimilarity`,
        embeddedRequirementsIdentity: "content_addressed_existing_snapshot",
      },
      createdAt: at,
      updatedAt: at,
    });
  }

  function reselection(existing, current, selectedOptionId, options = {}) {
    requireValidArtifact(existing);
    if (existing.status === "confirmed") fail("CONFIRMED_TARGET_IMMUTABLE", "Подтверждённый целевой профиль нельзя заменить молча.");
    const candidate = createSelection(current, selectedOptionId, { ...options, ownerIntent: options.ownerIntent || existing.ownerIntent });
    if (existing.selectedOptionId === candidate.selectedOptionId && canonicalize(existing.upstream) === canonicalize(candidate.upstream)) return existing;
    const next = copy(candidate); next.decisionId = existing.decisionId; next.revision = existing.revision + 1; next.createdAt = existing.createdAt; next.updatedAt = now(options.now); return seal(next);
  }

  function confirm(existing, current, options = {}) {
    requireValidArtifact(existing);
    const inspected = inspectArtifact(existing, current);
    if (inspected.effectiveStatus === "stale") fail("TARGET_DECISION_STALE", "Рекомендация изменилась; старое решение сохранено как устаревшее и не подтверждается.");
    if (inspected.effectiveStatus === "failed") fail("TARGET_DECISION_FAILED", "Решение повреждено и не подтверждается.");
    if (existing.status === "confirmed") return existing;
    if (existing.status !== "ready_to_confirm") fail("TARGET_DECISION_NOT_READY", "Сначала явно выбери один вариант.");
    const snapshot = selectedOptionSnapshot(current.recommendation, existing.selectedOptionId);
    if (canonicalize(snapshot) !== canonicalize(existing.selectedOptionSnapshot)) fail("TARGET_DECISION_SNAPSHOT_MISMATCH", "Выбранный вариант изменился; старый immutable snapshot не переписан.");
    const at = now(options.now); const next = copy(existing); next.status = "confirmed"; next.confirmedAt = at; next.revision += 1; next.updatedAt = at; next.upstream = normalizeUpstream(options.nextUpstream || current.upstream); return seal(next);
  }

  function requireValidArtifact(value) {
    exactObject(value, ["contractVersion", "status", "decisionId", "selectedOptionId", "selectedOptionSnapshot", "selectionReason", "ownerIntent", "confirmedAt", "revision", "canonicalFingerprint", "upstream", "provenance", "createdAt", "updatedAt"], "TARGET_DECISION_INTEGRITY_INVALID");
    if (value.contractVersion !== CONTRACT_VERSION || !/^garment-yarn-target-decision:[0-9a-f]{8}$/.test(value.decisionId || "") || !["ready_to_confirm", "confirmed"].includes(value.status)) fail("TARGET_DECISION_INTEGRITY_INVALID", "Identity или status решения повреждены.");
    if (!OPTION_FIELDS.some((entry) => entry.optionId === value.selectedOptionId) || !Object.values(OWNER_INTENTS).includes(value.ownerIntent)) fail("TARGET_DECISION_INTEGRITY_INVALID", "Выбранный option ID или owner intent повреждён.");
    positiveInteger(value.revision); timestamp(value.createdAt); timestamp(value.updatedAt); timestamp(value.confirmedAt, true);
    if ((value.status === "confirmed") !== (value.confirmedAt !== null)) fail("TARGET_DECISION_INTEGRITY_INVALID", "Подтверждение и confirmedAt расходятся.");
    exactObject(value.selectedOptionSnapshot, ["optionId", "sourceField", "kind", "metersPer100g", "categoryRu", "targetStitchesPer10cm", "targetRowsPer10cm", "rowGaugeUncertainty", "initialNeedlesMm", "strandCount", "surface", "textureEffect", "drapeStructure", "garmentWeightVolume", "trimBehavior", "referenceSimilarity", "risk", "confidence", "basis"]);
    if (value.selectedOptionSnapshot.optionId !== value.selectedOptionId || value.selectedOptionSnapshot.kind !== value.selectedOptionId || value.selectionReason !== value.selectedOptionSnapshot.referenceSimilarity) fail("TARGET_DECISION_SNAPSHOT_MISMATCH", "Snapshot выбранного варианта повреждён.");
    normalizeUpstream(value.upstream);
    exactObject(value.provenance, ["method", "sourceRecommendationContract", "selectionEvidencePath", "embeddedRequirementsIdentity"]); Object.values(value.provenance).forEach((entry) => nonEmpty(entry));
    if (!FINGERPRINT.test(value.canonicalFingerprint || "") || fnv1a32(core(value)) !== value.canonicalFingerprint) fail("TARGET_DECISION_FINGERPRINT_MISMATCH", "Fingerprint решения не совпадает.");
    return true;
  }

  function sameUpstream(left, right) {
    const a = normalizeUpstream(left); const b = normalizeUpstream(right);
    a.project.revision = 1; b.project.revision = 1;
    return canonicalize(a) === canonicalize(b);
  }
  function inspectArtifact(value, current) {
    if (!value) return freeze({ artifact: null, effectiveStatus: "ready_to_choose", current: true, errorCode: null });
    try {
      requireValidArtifact(value);
      const artifact = freeze(copy(value));
      if (!current || !sameUpstream(value.upstream, current.upstream)) return freeze({ artifact, effectiveStatus: "stale", current: false, errorCode: "TARGET_DECISION_UPSTREAM_CHANGED" });
      return freeze({ artifact, effectiveStatus: value.status, current: true, errorCode: null });
    } catch (error) {
      return freeze({ artifact: null, effectiveStatus: "failed", current: false, errorCode: error.code || "TARGET_DECISION_INTEGRITY_INVALID" });
    }
  }

  function activeCalculation(aggregate) { return aggregate.calculations.find((entry) => entry.calculation_id === aggregate.project.active_calculation_id) || null; }
  async function currentForProject(repository, projectId) {
    const inspected = await recommendationDomain().inspectForProject(repository, projectId);
    const current = currentContextFromInspection(inspected);
    return { recommendationInspected: inspected, current };
  }

  async function inspectForProject(repository, projectId) {
    const { recommendationInspected, current } = await currentForProject(repository, projectId);
    const calculation = activeCalculation(recommendationInspected.aggregate);
    const progress = recommendationInspected.aggregate.progress.find((entry) => entry.kind === PROGRESS_KIND && entry.calculation_id === calculation.calculation_id && entry.epoch === 1) || null;
    return { ...inspectArtifact(progress?.state || null, current), aggregate: recommendationInspected.aggregate, calculation, progress, current, closest: resolveClosestOption(current.recommendation) };
  }

  async function selectForProject(repository, projectId, selectedOptionId, options = {}) {
    const inspected = await inspectForProject(repository, projectId);
    const predicted = copy(inspected.current); predicted.upstream.project.revision = inspected.aggregate.project.revision + 1;
    let candidate;
    if (!inspected.progress) candidate = createSelection(predicted, selectedOptionId, options);
    else {
      if (inspected.effectiveStatus === "stale") fail("TARGET_DECISION_STALE", "Старое решение устарело и не будет переписано молча.");
      candidate = reselection(inspected.artifact, predicted, selectedOptionId, options);
      if (candidate === inspected.artifact) return inspected;
    }
    if (!inspected.progress) await repository.ensureCalculationProgress(projectId, inspected.calculation.calculation_id, PROGRESS_KIND, candidate, { operationKind: "GARMENT_YARN_TARGET_DECISION_SELECTED", timestamp: options.now });
    else await repository.updateCalculationProgress(projectId, inspected.calculation.calculation_id, PROGRESS_KIND, candidate, { baseProgressRevision: inspected.progress.revision, operationKind: "GARMENT_YARN_TARGET_DECISION_RESELECTED", timestamp: options.now });
    return inspectForProject(repository, projectId);
  }

  async function confirmForProject(repository, projectId, options = {}) {
    const inspected = await inspectForProject(repository, projectId);
    if (!inspected.progress || !inspected.artifact) fail("TARGET_DECISION_NOT_READY", "Сначала явно выбери один вариант.");
    if (inspected.effectiveStatus === "confirmed") return inspected;
    const predicted = copy(inspected.current); predicted.upstream.project.revision = inspected.aggregate.project.revision + 1;
    const candidate = confirm(inspected.artifact, inspected.current, { ...options, nextUpstream: predicted.upstream });
    await repository.updateCalculationProgress(projectId, inspected.calculation.calculation_id, PROGRESS_KIND, candidate, { baseProgressRevision: inspected.progress.revision, operationKind: "GARMENT_YARN_TARGET_DECISION_CONFIRMED", timestamp: options.now });
    return inspectForProject(repository, projectId);
  }

  const api = { CONTRACT_VERSION, PROGRESS_KIND, OWNER_INTENTS, STATUSES, optionModels, resolveClosestOption, selectedOptionSnapshot, createSelection, reselection, confirm, requireValidArtifact, inspectArtifact, inspectForProject, selectForProject, confirmForProject, fingerprint: fnv1a32 };
  globalObject.YarnAIGarmentYarnTargetDecision = freeze(api);
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window === "undefined" ? globalThis : window);
