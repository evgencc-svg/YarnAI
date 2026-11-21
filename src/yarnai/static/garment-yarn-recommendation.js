"use strict";

(function initializeGarmentYarnRecommendation(globalObject) {
  const CONTRACT_VERSION = "GARMENT_YARN_RECOMMENDATION_V1";
  const PROGRESS_KIND = "GARMENT_YARN_RECOMMENDATION";
  const STATUSES = new Set(["ready", "partial", "needs_closeup", "stale", "failed"]);
  const VARIANT_KINDS = ["thinner", "recommended_middle", "thicker"];
  const CONFIDENCE = new Set(["low", "medium", "high"]);
  const SURFACES = new Set(["smooth", "slight_halo", "medium_halo", "strong_halo_or_brushed"]);
  const SEMANTIC_CONTRACT_VERSION = "GARMENT_YARN_SEMANTIC_V1";
  const LIMITATION_CODES = ["exact_fiber_composition_unknown", "exact_brand_article_unknown", "original_yarn_linear_density_unknown", "actual_original_gauge_unknown", "post_wash_behavior_unknown"];
  const VISUAL_FACT_CODES = { knitScale: "knit_scale", verticalTexture: "vertical_texture", stitchClarity: "stitch_clarity", surface: "surface", fabricBehavior: "fabric_behavior", colorEffect: "color_effect" };
  const FABRIC_BEHAVIOR_LABELS = { compact_stable_form: "компактная стабильная форма полотна", pliable_drape: "предположительно пластичное полотно", structured_drape: "предположительно структурное полотно", cannot_determine: "поведение полотна по фотографии определить нельзя" };
  const EXACT_CLAIM = /(точн(?:ая|ый|ое)\s+(?:марка|состав|метраж|плотность|спиц)[^.]{0,60}(?:распознан|определ[её]н)|(?:распознан|определ[её]н)[^.]{0,60}точн(?:ая|ый|ое)\s+(?:марка|состав|метраж|плотность|спиц))/iu;

  function copy(value) { return value === undefined ? undefined : JSON.parse(JSON.stringify(value)); }
  function freeze(value) { if (value && typeof value === "object" && !Object.isFrozen(value)) { Object.values(value).forEach(freeze); Object.freeze(value); } return value; }
  function canonicalize(value) { if (Array.isArray(value)) return `[${value.map(canonicalize).join(",")}]`; if (value && typeof value === "object") return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalize(value[key])}`).join(",")}}`; return JSON.stringify(value); }
  function fnv1a32(value) { const bytes = new TextEncoder().encode(canonicalize(value)); let hash = 0x811c9dc5; for (const byte of bytes) { hash ^= byte; hash = Math.imul(hash, 0x01000193) >>> 0; } return `fnv1a32:${hash.toString(16).padStart(8, "0")}`; }
  function fail(code, message) { const error = new Error(message); error.code = code; throw error; }
  function exactObject(value, keys, code = "RECOMMENDATION_SCHEMA_INVALID") { if (!value || typeof value !== "object" || Array.isArray(value) || Object.keys(value).sort().join("|") !== [...keys].sort().join("|")) fail(code, "Структура рекомендации повреждена."); return value; }
  function text(value, field, max = 2000) { if (typeof value !== "string" || !value.trim() || value.trim().length > max) fail("RECOMMENDATION_SCHEMA_INVALID", `${field} заполнено неверно.`); const normalized = value.trim(); if (EXACT_CLAIM.test(normalized)) fail("FALSE_EXACT_YARN_CLAIM", "Рекомендацию нельзя выдавать за точное распознавание исходной пряжи."); return normalized; }
  function texts(value, field, min = 1, max = 12) { if (!Array.isArray(value) || value.length < min || value.length > max) fail("RECOMMENDATION_SCHEMA_INVALID", `${field} заполнено неверно.`); return value.map((item) => text(item, field)); }
  function range(value, field, options = {}) { exactObject(value, ["min", "max", "unit"]); const min = value.min; const max = value.max; if (typeof min !== "number" || typeof max !== "number" || !Number.isFinite(min) || !Number.isFinite(max) || min <= 0 || max <= 0 || min > max || value.unit !== options.unit) fail("RECOMMENDATION_RANGE_INVALID", `${field}: диапазон или единица измерения неверны.`); if (options.integer && (!Number.isInteger(min) || !Number.isInteger(max))) fail("RECOMMENDATION_RANGE_INVALID", `${field}: нужны целые значения.`); return { min, max, unit: value.unit }; }
  function timestamp(value) { const parsed = Date.parse(value); if (typeof value !== "string" || !Number.isFinite(parsed)) fail("RECOMMENDATION_TIME_INVALID", "Время рекомендации повреждено."); return value; }
  function now(value) { return timestamp(value || new Date().toISOString()); }

  function normalizeLegacyVisualEvidence(value) {
    exactObject(value, ["knitScale", "verticalTexture", "stitchClarity", "surface", "fabricBehavior", "colorEffect", "photoLimitations", "confidence", "basis"]);
    if (!CONFIDENCE.has(value.confidence)) fail("RECOMMENDATION_SCHEMA_INVALID", "Уверенность observation неверна.");
    return { knitScale: text(value.knitScale, "Масштаб вязки"), verticalTexture: text(value.verticalTexture, "Вертикальная фактура"), stitchClarity: text(value.stitchClarity, "Чёткость петель"), surface: text(value.surface, "Поверхность"), fabricBehavior: text(value.fabricBehavior, "Характер полотна"), colorEffect: text(value.colorEffect, "Цветовой эффект"), photoLimitations: texts(value.photoLimitations, "Ограничения фотографии", 1, 8), confidence: value.confidence, basis: texts(value.basis, "Основания observation", 1, 8) };
  }

  function normalizeClaimProvenance(value) {
    exactObject(value, Object.keys(VISUAL_FACT_CODES));
    const normalized = {};
    for (const [field, factCode] of Object.entries(VISUAL_FACT_CODES)) {
      const claim = exactObject(value[field], ["kind", "upstreamFactCode", "uncertainty"]);
      if (claim.upstreamFactCode !== factCode || !["observed", "inferred"].includes(claim.kind)) fail("UNGROUNDED_VISUAL_EVIDENCE", `Происхождение ${field} не подтверждено.`);
      if ((claim.kind === "observed" && claim.uncertainty !== null) || (claim.kind === "inferred" && !CONFIDENCE.has(claim.uncertainty))) fail("UNGROUNDED_VISUAL_EVIDENCE", `Неопределённость ${field} указана неверно.`);
      normalized[field] = { kind: claim.kind, upstreamFactCode: factCode, uncertainty: claim.uncertainty };
    }
    return normalized;
  }

  function normalizeVisualEvidence(value) {
    exactObject(value, ["knitScale", "verticalTexture", "stitchClarity", "surface", "fabricBehavior", "colorEffect", "claimProvenance", "photoLimitations", "confidence", "basis"]);
    if (!CONFIDENCE.has(value.confidence)) fail("RECOMMENDATION_SCHEMA_INVALID", "Уверенность observation неверна.");
    const fabric = exactObject(value.fabricBehavior, ["behaviorCode"], "UNGROUNDED_VISUAL_EVIDENCE");
    if (!Object.hasOwn(FABRIC_BEHAVIOR_LABELS, fabric.behaviorCode)) fail("UNGROUNDED_VISUAL_EVIDENCE", "Характер полотна должен быть выбран из контролируемого списка без construction claim.");
    const claimProvenance = normalizeClaimProvenance(value.claimProvenance);
    return {
      display: { knitScale: text(value.knitScale, "Масштаб вязки"), verticalTexture: text(value.verticalTexture, "Вертикальная фактура"), stitchClarity: text(value.stitchClarity, "Чёткость петель"), surface: text(value.surface, "Поверхность"), fabricBehavior: FABRIC_BEHAVIOR_LABELS[fabric.behaviorCode], colorEffect: text(value.colorEffect, "Цветовой эффект"), photoLimitations: texts(value.photoLimitations, "Ограничения фотографии", 1, 8), confidence: value.confidence, basis: texts(value.basis, "Основания observation", 1, 8) },
      semantic: { fabricBehaviorCode: fabric.behaviorCode, claimProvenance },
    };
  }

  function normalizeLimitations(value) {
    if (!Array.isArray(value) || value.length !== LIMITATION_CODES.length) fail("REQUIRED_LIMITATION_MISSING", "Нужны пять отдельных обязательных ограничений.");
    const normalized = value.map((entry) => { exactObject(entry, ["code", "explanation"]); if (!LIMITATION_CODES.includes(entry.code)) fail("REQUIRED_LIMITATION_MISSING", "Код ограничения не разрешён."); return { code: entry.code, explanation: text(entry.explanation, "Ограничение") }; });
    if (new Set(normalized.map((entry) => entry.code)).size !== LIMITATION_CODES.length || LIMITATION_CODES.some((code) => !normalized.some((entry) => entry.code === code))) fail("REQUIRED_LIMITATION_MISSING", "Каждое обязательное ограничение нужно указать ровно один раз.");
    return { display: normalized.map((entry) => entry.explanation), semantic: normalized };
  }

  function normalizeSurfaceEffect(value, expectedLevel) {
    exactObject(value, ["level", "verticalTexture", "trimClarity", "volumeHalo", "referenceDifference"]);
    if (value.level !== expectedLevel) fail("SURFACE_LEVELS_NOT_DISTINCT", "Уровни поверхности перепутаны или объединены.");
    const normalized = { level: value.level, verticalTexture: text(value.verticalTexture, "Читаемость вертикальной фактуры"), trimClarity: text(value.trimClarity, "Чёткость планки и воротника"), volumeHalo: text(value.volumeHalo, "Визуальный объём и пушистость"), referenceDifference: text(value.referenceDifference, "Отличие от фотографии") };
    return { semantic: normalized, display: `${normalized.verticalTexture} ${normalized.trimClarity} ${normalized.volumeHalo} ${normalized.referenceDifference}` };
  }

  function normalizeSurfaceRecommendation(value) {
    exactObject(value, ["smooth", "slightHalo", "mediumHalo", "strongHalo", "companionThread"], "SURFACE_LEVELS_NOT_DISTINCT");
    const smooth = normalizeSurfaceEffect(value.smooth, "smooth"); const slight = normalizeSurfaceEffect(value.slightHalo, "slight_halo"); const medium = normalizeSurfaceEffect(value.mediumHalo, "medium_halo"); const strong = normalizeSurfaceEffect(value.strongHalo, "strong_halo");
    return {
      display: { preferred: smooth.display, slightHalo: slight.display, mediumHalo: medium.display, strongHalo: strong.display, companionThread: text(value.companionThread, "Дополнительная нить") },
      semantic: [smooth.semantic, slight.semantic, medium.semantic, strong.semantic],
    };
  }

  function normalizeManufacturingChoice(value) {
    exactObject(value, ["provenance", "constructionIdentity", "decisionId", "decisionRevision", "decisionFingerprint", "explanation"]);
    if (value.provenance !== "selected" || !Number.isSafeInteger(value.decisionRevision) || value.decisionRevision < 1) fail("RECOMMENDATION_PROVENANCE_INVALID", "Owner-selected technology должна иметь exact selected binding.");
    return { provenance: "selected", constructionIdentity: text(value.constructionIdentity, "Construction identity", 200), decisionId: text(value.decisionId, "Decision ID", 200), decisionRevision: value.decisionRevision, decisionFingerprint: text(value.decisionFingerprint, "Decision fingerprint", 200), explanation: text(value.explanation, "Selected technology explanation") };
  }

  function normalizeVariant(value, expectedKind) {
    exactObject(value, ["kind", "metersPer100g", "categoryRu", "targetStitchesPer10cm", "targetRowsPer10cm", "rowGaugeUncertainty", "initialNeedlesMm", "strandCount", "surface", "textureEffect", "drapeStructure", "garmentWeightVolume", "trimBehavior", "referenceSimilarity", "risk", "confidence", "basis"]);
    if (value.kind !== expectedKind || !CONFIDENCE.has(value.confidence) || !SURFACES.has(value.surface)) fail("RECOMMENDATION_SCHEMA_INVALID", "Вариант рекомендации имеет неверный kind, surface или confidence.");
    const rows = value.targetRowsPer10cm === null ? null : range(value.targetRowsPer10cm, "Ряды на 10 см", { unit: "rows_per_10cm" });
    if ((rows === null) !== (typeof value.rowGaugeUncertainty === "string" && Boolean(value.rowGaugeUncertainty.trim()))) fail("ROW_GAUGE_UNCERTAINTY_INVALID", "Неизвестный диапазон рядов требует честного объяснения.");
    const strandCount = value.strandCount;
    if (!Number.isInteger(strandCount) || strandCount < 1 || strandCount > 8) fail("RECOMMENDATION_RANGE_INVALID", "Количество сложений рекомендации неверно.");
    const textureEffect = text(value.textureEffect, "Эффект фактуры");
    if (value.surface === "strong_halo_or_brushed" && !/(скры|размы|чётк)/iu.test(textureEffect)) fail("SURFACE_EFFECT_MISSING", "Сильный ворс требует объяснить влияние на читаемость фактуры.");
    return { kind: value.kind, metersPer100g: range(value.metersPer100g, "Метраж", { unit: "m_per_100g" }), categoryRu: text(value.categoryRu, "Категория толщины", 200), targetStitchesPer10cm: range(value.targetStitchesPer10cm, "Петли на 10 см", { unit: "stitches_per_10cm" }), targetRowsPer10cm: rows, rowGaugeUncertainty: rows ? null : text(value.rowGaugeUncertainty, "Неопределённость рядов"), initialNeedlesMm: range(value.initialNeedlesMm, "Спицы", { unit: "mm" }), strandCount, surface: value.surface, textureEffect, drapeStructure: text(value.drapeStructure, "Пластичность"), garmentWeightVolume: text(value.garmentWeightVolume, "Вес и объём"), trimBehavior: text(value.trimBehavior, "Воротник, планка и резинка"), referenceSimilarity: text(value.referenceSimilarity, "Сходство"), risk: text(value.risk, "Риск"), confidence: value.confidence, basis: texts(value.basis, "Основания recommendation", 1, 6) };
  }

  function normalizePayload(payload) {
    exactObject(payload, ["status", "summary", "visualEvidence", "limitations", "recommendedMiddle", "thinnerAlternative", "thickerAlternative", "surfaceRecommendation", "manufacturingChoice", "swatchRequirement", "confidence", "provenance"]);
    if (!["ready", "partial", "needs_closeup"].includes(payload.status) || !CONFIDENCE.has(payload.confidence)) fail("RECOMMENDATION_SCHEMA_INVALID", "Status или confidence рекомендации неверны.");
    const visual = normalizeVisualEvidence(payload.visualEvidence); const limitations = normalizeLimitations(payload.limitations); const surface = normalizeSurfaceRecommendation(payload.surfaceRecommendation); const manufacturingChoice = normalizeManufacturingChoice(payload.manufacturingChoice);
    const variants = {
      thinnerAlternative: normalizeVariant(payload.thinnerAlternative, "thinner"),
      recommendedMiddle: normalizeVariant(payload.recommendedMiddle, "recommended_middle"),
      thickerAlternative: normalizeVariant(payload.thickerAlternative, "thicker"),
    };
    if (!(variants.thinnerAlternative.metersPer100g.min > variants.recommendedMiddle.metersPer100g.min && variants.recommendedMiddle.metersPer100g.min > variants.thickerAlternative.metersPer100g.min)) fail("YARN_THICKNESS_ORDER_INVALID", "Более тонкая пряжа должна иметь больший метраж на 100 г, чем более толстая.");
    exactObject(payload.swatchRequirement, ["message", "targetIsNotActualGauge"]);
    if (payload.swatchRequirement.targetIsNotActualGauge !== true) fail("TARGET_GAUGE_BOUNDARY_INVALID", "Target gauge нельзя считать фактической плотностью.");
    exactObject(payload.provenance, ["method", "provider", "model", "requestId"]);
    if (!['provider_supplement', 'main_photo_analysis'].includes(payload.provenance.method)) fail("RECOMMENDATION_PROVENANCE_INVALID", "Источник рекомендации не разрешён.");
    return { status: payload.status, summary: text(payload.summary, "Вывод"), visualEvidence: visual.display, limitations: limitations.display, ...variants, surfaceRecommendation: surface.display, swatchRequirement: { message: text(payload.swatchRequirement.message, "Образец"), targetIsNotActualGauge: true }, confidence: payload.confidence, provenance: { method: payload.provenance.method, provider: text(payload.provenance.provider, "Provider", 100), model: text(payload.provenance.model, "Model", 100), requestId: text(payload.provenance.requestId, "Request ID", 200) }, semanticContract: { contractName: SEMANTIC_CONTRACT_VERSION, visualEvidence: visual.semantic, limitations: limitations.semantic, surfaceEffects: surface.semantic, manufacturingChoice } };
  }

  function bindingFromAggregate(aggregate, calculationId) {
    const garmentDomain = globalObject.YarnAIGarmentReferenceAnalysis;
    const intakeDomain = globalObject.YarnAIManualCalculationIntake;
    if (!garmentDomain || !intakeDomain) fail("RECOMMENDATION_SOURCE_UNAVAILABLE", "Upstream-модули рекомендации недоступны.");
    const garmentProgress = aggregate.progress.find((entry) => entry.kind === garmentDomain.PROGRESS_KIND && entry.calculation_id === calculationId && entry.epoch === 1);
    const intakeProgress = aggregate.progress.find((entry) => entry.kind === intakeDomain.PROGRESS_KIND && entry.calculation_id === calculationId && entry.epoch === 1);
    if (!garmentProgress || !intakeProgress) fail("RECOMMENDATION_SOURCE_MISSING", "Не найдены analysis или manual intake.");
    const handoff = garmentDomain.technologyDecisionHandoff(garmentProgress.state);
    if (!handoff.isCurrent || !handoff.allowedToStartTechnologyPlan) fail("TECHNOLOGY_DECISION_NOT_CURRENT", "Рекомендация требует актуальной подтверждённой технологии.");
    intakeDomain.requireValidState(intakeProgress.state);
    const intake = intakeProgress.state.intakes.find((entry) => entry.intakeId === intakeProgress.state.activeIntakeId) || intakeProgress.state.intakes.at(-1);
    const photo = garmentProgress.state.source?.referencePhotos?.[0];
    if (!photo?.photoId || !photo?.sha256) fail("PHOTO_BINDING_MISSING", "Не найдена exact фотография рекомендации.");
    return freeze({ project: { id: aggregate.project.project_id }, photo: { id: photo.photoId, sha256: photo.sha256 }, analysis: { id: handoff.analysisId, revision: handoff.analysisRevision, fingerprint: handoff.sourceAnalysisFingerprint }, request: { id: handoff.analysisRequestId, fingerprint: handoff.sourceRequestFingerprint }, technologyDecision: { id: handoff.technologyDecisionId, revision: handoff.technologyDecisionRevision, fingerprint: handoff.technologyDecisionFingerprint, selectedOptionId: handoff.selectedOptionId }, garmentRequirements: { fingerprint: intake.garmentRequirementsProfile?.canonicalFingerprint || null, constructionIdentity: intake.garmentRequirementsProfile?.constructionIdentity || null }, yarnRequirements: { id: intake.yarnRequirementsProfile?.profileId || null, fingerprint: intake.yarnRequirementsProfile?.canonicalFingerprint || null } });
  }

  function core(artifact) { const value = copy(artifact); delete value.canonicalFingerprint; delete value.integrityStatus; return value; }
  function seal(artifact) { artifact.canonicalFingerprint = fnv1a32(core(artifact)); artifact.integrityStatus = "valid"; requireValidArtifact(artifact); return freeze(artifact); }
  function createArtifact(bindings, payload, options = {}) {
    const normalized = normalizePayload(payload); const choice = normalized.semanticContract.manufacturingChoice;
    assertManufacturingChoiceMatchesBindings(choice, bindings);
    const at = now(options.now); const identity = fnv1a32({ bindings, payload: normalized });
    return seal({ contractName: CONTRACT_VERSION, recommendationId: `garment-yarn-recommendation:${identity.slice(8)}`, revision: 1, status: normalized.status, createdAt: at, updatedAt: at, sourceBindings: copy(bindings), summary: normalized.summary, visualEvidence: normalized.visualEvidence, limitations: normalized.limitations, recommendedMiddle: normalized.recommendedMiddle, thinnerAlternative: normalized.thinnerAlternative, thickerAlternative: normalized.thickerAlternative, surfaceRecommendation: normalized.surfaceRecommendation, swatchRequirement: normalized.swatchRequirement, confidence: normalized.confidence, provenance: normalized.provenance, semanticContract: normalized.semanticContract, canonicalFingerprint: "", integrityStatus: "valid" });
  }
  function assertManufacturingChoiceMatchesBindings(choice, bindings) {
    const decision = bindings?.technologyDecision || {}; const construction = bindings?.garmentRequirements?.constructionIdentity;
    if (choice.decisionId !== decision.id || choice.decisionRevision !== decision.revision || choice.decisionFingerprint !== decision.fingerprint || choice.constructionIdentity !== construction) fail("SELECTED_TECHNOLOGY_BINDING_MISMATCH", "Selected technology не совпадает с authoritative upstream binding.");
    return true;
  }
  function validateStoredDisplay(value, semantic) {
    normalizeLegacyVisualEvidence(value.visualEvidence); texts(value.limitations, "Ограничения", 1, 8);
    normalizeVariant(value.thinnerAlternative, "thinner"); normalizeVariant(value.recommendedMiddle, "recommended_middle"); normalizeVariant(value.thickerAlternative, "thicker");
    exactObject(value.swatchRequirement, ["message", "targetIsNotActualGauge"]); if (value.swatchRequirement.targetIsNotActualGauge !== true) fail("TARGET_GAUGE_BOUNDARY_INVALID", "Target gauge нельзя считать фактической плотностью."); text(value.swatchRequirement.message, "Образец");
    exactObject(value.provenance, ["method", "provider", "model", "requestId"]); if (!['provider_supplement', 'main_photo_analysis'].includes(value.provenance.method)) fail("RECOMMENDATION_PROVENANCE_INVALID", "Источник рекомендации не разрешён.");
    if (semantic) {
      exactObject(value.surfaceRecommendation, ["preferred", "slightHalo", "mediumHalo", "strongHalo", "companionThread"]); Object.values(value.surfaceRecommendation).forEach((entry) => text(entry, "Поверхность"));
      exactObject(value.semanticContract, ["contractName", "visualEvidence", "limitations", "surfaceEffects", "manufacturingChoice"]);
      if (value.semanticContract.contractName !== SEMANTIC_CONTRACT_VERSION) fail("RECOMMENDATION_SEMANTIC_CONTRACT_INVALID", "Версия смыслового контракта неверна.");
      const visual = exactObject(value.semanticContract.visualEvidence, ["fabricBehaviorCode", "claimProvenance"]); if (!Object.hasOwn(FABRIC_BEHAVIOR_LABELS, visual.fabricBehaviorCode)) fail("UNGROUNDED_VISUAL_EVIDENCE", "Характер полотна повреждён."); normalizeClaimProvenance(visual.claimProvenance);
      normalizeLimitations(value.semanticContract.limitations);
      if (!Array.isArray(value.semanticContract.surfaceEffects) || value.semanticContract.surfaceEffects.length !== 4) fail("SURFACE_LEVELS_NOT_DISTINCT", "Нужны четыре отдельных уровня поверхности.");
      ["smooth", "slight_halo", "medium_halo", "strong_halo"].forEach((level, index) => normalizeSurfaceEffect(value.semanticContract.surfaceEffects[index], level));
      normalizeManufacturingChoice(value.semanticContract.manufacturingChoice);
    } else {
      exactObject(value.surfaceRecommendation, ["preferred", "slightHalo", "mediumOrStrongHalo", "companionThread"]); Object.values(value.surfaceRecommendation).forEach((entry) => text(entry, "Поверхность"));
    }
  }
  function requireValidArtifact(value) {
    const semantic = Boolean(value && typeof value === "object" && Object.hasOwn(value, "semanticContract"));
    const keys = ["contractName", "recommendationId", "revision", "status", "createdAt", "updatedAt", "sourceBindings", "summary", "visualEvidence", "limitations", "recommendedMiddle", "thinnerAlternative", "thickerAlternative", "surfaceRecommendation", "swatchRequirement", "confidence", "provenance", ...(semantic ? ["semanticContract"] : []), "canonicalFingerprint", "integrityStatus"];
    exactObject(value, keys, "RECOMMENDATION_INTEGRITY_INVALID");
    if (value.contractName !== CONTRACT_VERSION || !/^garment-yarn-recommendation:[0-9a-f]{8}$/.test(value.recommendationId || "") || !Number.isSafeInteger(value.revision) || value.revision < 1 || !STATUSES.has(value.status)) fail("RECOMMENDATION_INTEGRITY_INVALID", "Identity рекомендации повреждена.");
    timestamp(value.createdAt); timestamp(value.updatedAt); text(value.summary, "Вывод"); if (!CONFIDENCE.has(value.confidence)) fail("RECOMMENDATION_SCHEMA_INVALID", "Confidence рекомендации неверен."); validateStoredDisplay(value, semantic);
    if (value.integrityStatus !== "valid" || fnv1a32(core(value)) !== value.canonicalFingerprint) fail("RECOMMENDATION_FINGERPRINT_MISMATCH", "Fingerprint рекомендации не совпадает.");
    return true;
  }

  function sameBindings(left, right) { return canonicalize(left) === canonicalize(right); }
  function validateCurrentArtifact(value, currentBindings) {
    requireValidArtifact(value);
    if (!Object.hasOwn(value, "semanticContract")) fail("RECOMMENDATION_SEMANTIC_CONTRACT_MISSING", "Сохранённая рекомендация не содержит обязательный текущий смысловой контракт.");
    validateStoredDisplay(value, true);
    assertManufacturingChoiceMatchesBindings(normalizeManufacturingChoice(value.semanticContract.manufacturingChoice), currentBindings || value.sourceBindings);
    return true;
  }
  function inspectArtifact(value, currentBindings) {
    try {
      requireValidArtifact(value);
      const artifact = freeze(copy(value));
      if (currentBindings && !sameBindings(value.sourceBindings, currentBindings)) return freeze({ artifact, integrityStatus: "valid", current: false, effectiveStatus: "stale", currentValidation: freeze({ schemaDomainValid: true, semanticValid: null, bindingValid: false, reasonCode: "RECOMMENDATION_BINDING_MISMATCH" }) });
      try {
        validateCurrentArtifact(value, currentBindings);
        return freeze({ artifact, integrityStatus: "valid", current: true, effectiveStatus: value.status, currentValidation: freeze({ schemaDomainValid: true, semanticValid: true, bindingValid: true, reasonCode: "CURRENT_RECOMMENDATION_VALID" }) });
      } catch (error) {
        const reasonCode = error.code || "RECOMMENDATION_SEMANTIC_INVALID";
        return freeze({ artifact, integrityStatus: "valid", current: true, effectiveStatus: value.status, currentValidation: freeze({ schemaDomainValid: true, semanticValid: false, bindingValid: reasonCode !== "SELECTED_TECHNOLOGY_BINDING_MISMATCH", reasonCode }) });
      }
    } catch (error) {
      return freeze({ artifact: null, integrityStatus: "invalid", current: false, effectiveStatus: "failed", errorCode: error.code || "RECOMMENDATION_INTEGRITY_INVALID", currentValidation: freeze({ schemaDomainValid: false, semanticValid: null, bindingValid: false, reasonCode: error.code || "RECOMMENDATION_INTEGRITY_INVALID" }) });
    }
  }
  function retryControlState(inspected, configuration = {}, requestReady = false) {
    const artifact = inspected?.artifact || null;
    if (inspected?.progress && !artifact) return freeze({ available: false, mode: "blocked", reasonCode: inspected.errorCode || "RECOMMENDATION_ARTIFACT_UNREADABLE" });
    if (artifact && inspected.current !== true) return freeze({ available: false, mode: "blocked", reasonCode: inspected.currentValidation?.reasonCode || "RECOMMENDATION_NOT_CURRENT" });
    if (artifact && inspected.currentValidation?.schemaDomainValid !== true) return freeze({ available: false, mode: "blocked", reasonCode: inspected.currentValidation?.reasonCode || "RECOMMENDATION_ARTIFACT_UNREADABLE" });
    if (artifact && inspected.currentValidation?.bindingValid !== true) return freeze({ available: false, mode: "blocked", reasonCode: inspected.currentValidation?.reasonCode || "RECOMMENDATION_BINDING_MISMATCH" });
    if (artifact && inspected.currentValidation?.semanticValid === true) return freeze({ available: false, mode: "blocked", reasonCode: "CURRENT_RECOMMENDATION_VALID" });
    if (artifact && inspected.currentValidation?.semanticValid !== false) return freeze({ available: false, mode: "blocked", reasonCode: "RECOMMENDATION_VALIDATION_UNKNOWN" });
    if (configuration.enabled !== true || configuration.pilotReady !== true || typeof configuration.requestId !== "string" || !configuration.requestId) return freeze({ available: false, mode: "blocked", reasonCode: "AUTHORIZATION_NOT_APPROVED_OR_CONSUMED" });
    if (configuration.authorizationMatches !== true) return freeze({ available: false, mode: "blocked", reasonCode: "AUTHORIZATION_BINDING_MISMATCH" });
    if (requestReady !== true) return freeze({ available: false, mode: "blocked", reasonCode: "PHOTO_OR_SANITIZED_PNG_UNAVAILABLE" });
    return freeze({ available: true, mode: artifact ? "legacy_retry" : "initial", reasonCode: artifact ? "LEGACY_RECOMMENDATION_SEMANTIC_INVALID" : "NO_RECOMMENDATION" });
  }
  function authorizationMatchesPreparedRequest(binding, request) {
    if (!binding || !request || typeof binding !== "object" || typeof request !== "object") return false;
    const identity = request.source_identity || {};
    const image = request.sanitized_image || {};
    const expected = {
      request_id: request.request_id,
      source_identity: { project_id: identity.project_id, project_revision: identity.project_revision, reference_photos: copy(identity.reference_photos) },
      source_photo_id: request.source_photo_id,
      source_photo_sha256: request.source_photo_sha256,
      sanitized_photo_sha256: image.sha256,
      sanitized_width: image.width,
      sanitized_height: image.height,
      sanitized_byte_size: typeof image.content_base64 === "string" ? Math.floor(image.content_base64.length * 3 / 4) - (image.content_base64.endsWith("==") ? 2 : image.content_base64.endsWith("=") ? 1 : 0) : null,
    };
    return canonicalize(binding) === canonicalize(expected);
  }
  function activeCalculation(aggregate) { return aggregate.calculations.find((entry) => entry.calculation_id === aggregate.project.active_calculation_id) || null; }
  async function inspectForProject(repository, projectId) { const aggregate = await repository.getProject(projectId); const calculation = activeCalculation(aggregate); if (!calculation) return null; const progress = aggregate.progress.find((entry) => entry.kind === PROGRESS_KIND && entry.calculation_id === calculation.calculation_id && entry.epoch === 1); if (!progress) return { aggregate, calculation, progress: null, artifact: null, current: false, effectiveStatus: null }; const bindings = bindingFromAggregate(aggregate, calculation.calculation_id); const inspected = inspectArtifact(progress.state, bindings); return { aggregate, calculation, progress, ...inspected }; }
  async function saveForProject(repository, projectId, payload, options = {}) {
    let aggregate = await repository.getProject(projectId); const calculation = activeCalculation(aggregate); if (!calculation || calculation.request?.workflow_kind !== "garment_reference") fail("CALCULATION_MISMATCH", "Проект не относится к фото-маршруту."); const bindings = bindingFromAggregate(aggregate, calculation.calculation_id); const candidate = createArtifact(bindings, payload, options); const existing = aggregate.progress.find((entry) => entry.kind === PROGRESS_KIND && entry.calculation_id === calculation.calculation_id && entry.epoch === 1);
    if (!existing) await repository.ensureCalculationProgress(projectId, calculation.calculation_id, PROGRESS_KIND, candidate, { operationKind: "GARMENT_YARN_RECOMMENDATION_CREATED" });
    else { requireValidArtifact(existing.state); if (existing.state.recommendationId === candidate.recommendationId && sameBindings(existing.state.sourceBindings, candidate.sourceBindings)) return inspectForProject(repository, projectId); const next = copy(candidate); next.recommendationId = existing.state.recommendationId; next.revision = existing.state.revision + 1; next.createdAt = existing.state.createdAt; next.updatedAt = now(options.now); const sealed = seal(next); await repository.updateCalculationProgress(projectId, calculation.calculation_id, PROGRESS_KIND, sealed, { baseProgressRevision: existing.revision, operationKind: "GARMENT_YARN_RECOMMENDATION_UPDATED" }); }
    return inspectForProject(repository, projectId);
  }
  function metersPer50g(value) { const valid = range(value, "Метраж", { unit: "m_per_100g" }); return freeze({ min: valid.min / 2, max: valid.max / 2, unit: "m_per_50g" }); }

  const api = { CONTRACT_VERSION, PROGRESS_KIND, VARIANT_KINDS: freeze([...VARIANT_KINDS]), createArtifact, requireValidArtifact, validateCurrentArtifact, inspectArtifact, inspectForProject, retryControlState, authorizationMatchesPreparedRequest, saveForProject, normalizePayload, metersPer50g, fingerprint: fnv1a32 };
  globalObject.YarnAIGarmentYarnRecommendation = freeze(api);
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window === "undefined" ? globalThis : window);
