"use strict";

(function initializeGarmentActualYarn(globalObject) {
  const CONTRACT_VERSION = "GARMENT_ACTUAL_YARN_V1";
  const ROUTES = Object.freeze({ NOT_SELECTED: "not_selected", ALREADY_HAVE: "already_have", HELP_CHOOSE: "help_choose" });
  const SURFACES = Object.freeze(["smooth", "slight_halo", "strong_halo", "unknown"]);
  const ASSESSMENT_STATUSES = Object.freeze(["close_to_target", "usable_with_differences", "noticeable_difference_risk", "insufficient_data"]);
  const FINGERPRINT = /^fnv1a32:[0-9a-f]{8}$/;
  const SHA256 = /^[0-9a-f]{64}$/;

  function copy(value) { return value === undefined ? undefined : JSON.parse(JSON.stringify(value)); }
  function freeze(value) { if (value && typeof value === "object" && !Object.isFrozen(value)) { Object.values(value).forEach(freeze); Object.freeze(value); } return value; }
  function canonicalize(value) { if (value === undefined) return "undefined"; if (Array.isArray(value)) return `[${value.map(canonicalize).join(",")}]`; if (value && typeof value === "object") return `{${Object.keys(value).filter((key) => value[key] !== undefined).sort().map((key) => `${JSON.stringify(key)}:${canonicalize(value[key])}`).join(",")}}`; return JSON.stringify(value); }
  function fnv1a32(value) { const source = canonicalize(value); let hash = 0x811c9dc5; for (let index = 0; index < source.length; index += 1) { hash ^= source.charCodeAt(index); hash = Math.imul(hash, 0x01000193); } return `fnv1a32:${(hash >>> 0).toString(16).padStart(8, "0")}`; }
  function fail(code, message) { const error = new Error(message); error.code = code; error.userMessage = message; throw error; }
  function exactObject(value, keys, code = "ACTUAL_YARN_INTEGRITY_INVALID") { if (!value || typeof value !== "object" || Array.isArray(value) || Object.keys(value).sort().join("|") !== [...keys].sort().join("|")) fail(code, "Сохранённые данные фактической пряжи повреждены."); return value; }
  function text(value, maximum = 500) { if (value === null || value === undefined || value === "") return null; if (typeof value !== "string") fail("ACTUAL_YARN_VALUE_INVALID", "Текстовое поле пряжи имеет неверный формат."); const normalized = value.trim().replace(/\s+/g, " "); if (!normalized || normalized.length > maximum) fail("ACTUAL_YARN_VALUE_INVALID", "Текстовое поле пряжи имеет неверную длину."); return normalized; }
  function positive(value, maximum = 1000000) { if (value === null || value === undefined || value === "") return null; const number = typeof value === "number" ? value : Number(value); if (!Number.isFinite(number) || number <= 0 || number > maximum) fail("ACTUAL_YARN_NUMBER_INVALID", "Масса, длина и количество должны быть положительными числами."); return Math.round((number + Number.EPSILON) * 10000) / 10000; }
  function timestamp(value) { if (typeof value !== "string" || !Number.isFinite(Date.parse(value))) fail("ACTUAL_YARN_TIME_INVALID", "Время записи пряжи повреждено."); return value; }
  function now(value) { return timestamp(value || new Date().toISOString()); }
  function fingerprint(value) { if (!FINGERPRINT.test(value || "")) fail("ACTUAL_YARN_UPSTREAM_INVALID", "Fingerprint источника отсутствует или повреждён."); return value; }
  function positiveInteger(value) { if (!Number.isSafeInteger(value) || value < 1) fail("ACTUAL_YARN_UPSTREAM_INVALID", "Revision источника отсутствует или повреждён."); return value; }
  function requiredText(value) { if (typeof value !== "string" || !value.trim()) fail("ACTUAL_YARN_UPSTREAM_INVALID", "Identity источника отсутствует."); return value.trim(); }
  function contentId(prefix, value) { return `${prefix}:${fnv1a32(value).slice(8)}`; }

  function intakeDomain() { const domain = globalObject.YarnAIManualCalculationIntake; if (!domain) fail("ACTUAL_YARN_DOMAIN_UNAVAILABLE", "Модуль черновика исходных данных недоступен."); return domain; }
  function recommendationDomain() { const domain = globalObject.YarnAIGarmentYarnRecommendation; if (!domain) fail("ACTUAL_YARN_DOMAIN_UNAVAILABLE", "Сохранённая рекомендация недоступна."); return domain; }
  function targetDomain() { const domain = globalObject.YarnAIGarmentYarnTargetDecision; if (!domain) fail("ACTUAL_YARN_DOMAIN_UNAVAILABLE", "Целевой профиль пряжи недоступен."); return domain; }

  function metersPer100g(weightGrams, lengthMeters) {
    const weight = positive(weightGrams);
    const length = positive(lengthMeters);
    if (weight === null || length === null) return null;
    return Math.round(((length / weight) * 100 + Number.EPSILON) * 10000) / 10000;
  }

  function normalizePhotos(values) {
    if (!Array.isArray(values)) return [];
    const result = values.map((photo) => {
      exactObject(photo, ["photoId", "role", "displayName", "sha256", "mimeType", "storage"]);
      if (typeof photo.photoId !== "string" || !photo.photoId || !["yarn_label", "yarn_appearance"].includes(photo.role) || !SHA256.test(photo.sha256 || "") || !["image/jpeg", "image/png", "image/webp"].includes(photo.mimeType) || photo.storage !== "local_only") fail("ACTUAL_YARN_PHOTO_INVALID", "Фотография пряжи не прошла локальную проверку identity.");
      return copy(photo);
    });
    const keys = new Set();
    result.forEach((photo) => { const key = `${photo.role}:${photo.photoId}`; if (keys.has(key)) fail("ACTUAL_YARN_PHOTO_INVALID", "Одна фотография пряжи сохранена дважды."); keys.add(key); });
    return result.sort((left, right) => `${left.role}:${left.photoId}`.localeCompare(`${right.role}:${right.photoId}`));
  }

  function normalizeCandidateInput(value, photoRefs = []) {
    const input = value && typeof value === "object" && !Array.isArray(value) ? value : {};
    const surface = SURFACES.includes(input.surface) ? input.surface : "unknown";
    const needlesMinMm = positive(input.needlesMinMm, 30);
    const needlesMaxMm = positive(input.needlesMaxMm, 30);
    if (needlesMinMm !== null && needlesMaxMm !== null && needlesMinMm > needlesMaxMm) fail("ACTUAL_YARN_NEEDLE_RANGE_INVALID", "Минимальный размер спиц не может быть больше максимального.");
    return {
      skeinWeightGrams: positive(input.skeinWeightGrams),
      lengthMeters: positive(input.lengthMeters),
      availableSkeins: positive(input.availableSkeins, 10000),
      totalWeightGrams: positive(input.totalWeightGrams),
      manufacturer: text(input.manufacturer, 200),
      name: text(input.name, 300),
      article: text(input.article, 200),
      color: text(input.color, 200),
      dyeLot: text(input.dyeLot, 200),
      composition: text(input.composition, 500),
      needlesMinMm,
      needlesMaxMm,
      surface,
      photoRefs: normalizePhotos(photoRefs),
    };
  }

  function candidateCore(value) { const result = copy(value); delete result.canonicalFingerprint; return result; }
  function sealCandidate(value) { value.canonicalFingerprint = fnv1a32(candidateCore(value)); requireValidCandidate(value); return freeze(value); }
  function createCandidate(input, options = {}) {
    const data = normalizeCandidateInput(input, options.photoRefs || []);
    const at = now(options.now);
    const candidateId = options.candidateId || contentId("garment-yarn-candidate", { projectId: requiredText(options.projectId), contractVersion: CONTRACT_VERSION });
    return sealCandidate({ contractVersion: CONTRACT_VERSION, candidateId, revision: positiveInteger(options.revision || 1), data, metersPer100g: metersPer100g(data.skeinWeightGrams, data.lengthMeters), createdAt: options.createdAt ? timestamp(options.createdAt) : at, updatedAt: at, canonicalFingerprint: "" });
  }
  function requireValidCandidate(value) {
    exactObject(value, ["contractVersion", "candidateId", "revision", "data", "metersPer100g", "createdAt", "updatedAt", "canonicalFingerprint"]);
    if (value.contractVersion !== CONTRACT_VERSION || !/^garment-yarn-candidate:[0-9a-f]{8}$/.test(value.candidateId || "")) fail("ACTUAL_YARN_CANDIDATE_INVALID", "Identity кандидата фактической пряжи повреждена.");
    positiveInteger(value.revision); timestamp(value.createdAt); timestamp(value.updatedAt);
    const normalized = normalizeCandidateInput(value.data, value.data?.photoRefs || []);
    if (canonicalize(normalized) !== canonicalize(value.data) || metersPer100g(value.data.skeinWeightGrams, value.data.lengthMeters) !== value.metersPer100g || !FINGERPRINT.test(value.canonicalFingerprint || "") || fnv1a32(candidateCore(value)) !== value.canonicalFingerprint) fail("ACTUAL_YARN_CANDIDATE_INVALID", "Кандидат фактической пряжи не прошёл проверку целостности.");
    return true;
  }

  function targetRange(snapshot) {
    const range = snapshot?.metersPer100g;
    if (!range || !Number.isFinite(range.min) || !Number.isFinite(range.max) || range.min <= 0 || range.max < range.min || range.unit !== "m_per_100g") fail("ACTUAL_YARN_TARGET_INVALID", "В выбранном профиле нет проверяемого диапазона м/100 г.");
    return { min: range.min, max: range.max, unit: range.unit };
  }
  function missingFacts(candidate) {
    const missing = [];
    if (candidate.data.skeinWeightGrams === null) missing.push("масса мотка в граммах");
    if (candidate.data.lengthMeters === null) missing.push("длина нити в метрах");
    return missing;
  }
  function assess(candidate, targetSnapshot, options = {}) {
    requireValidCandidate(candidate);
    const range = targetRange(targetSnapshot);
    const missing = missingFacts(candidate);
    let status = "insufficient_data";
    let direction = "unknown";
    const changes = [];
    if (!missing.length) {
      const actual = candidate.metersPer100g;
      if (actual >= range.min && actual <= range.max) {
        status = "close_to_target"; direction = "inside";
        changes.push("По метражу пряжа близка к выбранному ориентиру. Это ещё не гарантирует одинаковое полотно: состав, крутка и пушистость также влияют на результат.");
      } else if (actual > range.max) {
        direction = "thinner";
        status = (actual - range.max) / range.max <= 0.15 ? "usable_with_differences" : "noticeable_difference_risk";
        changes.push("Пряжа тоньше выбранного ориентира. Полотно, вероятно, получится легче, а фактура — мельче. На 10 см обычно требуется больше петель. Точное число определит образец.");
      } else {
        direction = "thicker";
        status = (range.min - actual) / range.min <= 0.15 ? "usable_with_differences" : "noticeable_difference_risk";
        changes.push("Пряжа толще выбранного ориентира. Полотно, вероятно, получится объёмнее и плотнее, а на 10 см обычно потребуется меньше петель. Точное число определит образец.");
      }
      if (candidate.data.surface === "strong_halo") {
        changes.push("Сильный пушистый ореол может скрыть мелкую фактуру и сделать поверхность менее похожей на фотографию.");
        status = "noticeable_difference_risk";
      } else if (candidate.data.surface === "smooth") changes.push("Фактура может стать чётче, но слегка смягчённая поверхность фотографии будет выражена слабее.");
      else if (candidate.data.surface === "slight_halo") changes.push("Лёгкий пушистый ореол ближе к выбранному ориентиру, но одинаковый метраж всё равно не гарантирует одинаковое полотно.");
    }
    const facts = { actualMetersPer100g: candidate.metersPer100g, targetMetersPer100g: range, surface: candidate.data.surface };
    const at = now(options.now);
    const core = { contractVersion: CONTRACT_VERSION, assessmentId: contentId("garment-yarn-assessment", { candidate: candidate.canonicalFingerprint, target: options.targetFingerprint || targetSnapshot }), candidateId: candidate.candidateId, candidateRevision: candidate.revision, candidateFingerprint: candidate.canonicalFingerprint, targetDecisionId: requiredText(options.targetDecisionId), targetDecisionRevision: positiveInteger(options.targetDecisionRevision), targetDecisionFingerprint: fingerprint(options.targetDecisionFingerprint), targetOptionId: requiredText(options.targetOptionId), status, direction, missingFacts: missing, knownFacts: facts, likelyChanges: changes, onlyAfterSwatch: ["Точное число петель на 10 см", "Точное число рядов на 10 см", "Точная плотность, размер спиц, расход и окончательная посадка"], assessedAt: at };
    const assessment = { ...core, canonicalFingerprint: fnv1a32(core) };
    requireValidAssessment(assessment);
    return freeze(assessment);
  }
  function requireValidAssessment(value) {
    exactObject(value, ["contractVersion", "assessmentId", "candidateId", "candidateRevision", "candidateFingerprint", "targetDecisionId", "targetDecisionRevision", "targetDecisionFingerprint", "targetOptionId", "status", "direction", "missingFacts", "knownFacts", "likelyChanges", "onlyAfterSwatch", "assessedAt", "canonicalFingerprint"]);
    if (value.contractVersion !== CONTRACT_VERSION || !/^garment-yarn-assessment:[0-9a-f]{8}$/.test(value.assessmentId || "") || !ASSESSMENT_STATUSES.includes(value.status) || !["inside", "thinner", "thicker", "unknown"].includes(value.direction)) fail("ACTUAL_YARN_ASSESSMENT_INVALID", "Оценка фактической пряжи повреждена.");
    positiveInteger(value.candidateRevision); positiveInteger(value.targetDecisionRevision); fingerprint(value.candidateFingerprint); fingerprint(value.targetDecisionFingerprint); timestamp(value.assessedAt);
    if (!Array.isArray(value.missingFacts) || !Array.isArray(value.likelyChanges) || !Array.isArray(value.onlyAfterSwatch) || !FINGERPRINT.test(value.canonicalFingerprint || "")) fail("ACTUAL_YARN_ASSESSMENT_INVALID", "Оценка фактической пряжи повреждена.");
    const core = copy(value); delete core.canonicalFingerprint; if (fnv1a32(core) !== value.canonicalFingerprint) fail("ACTUAL_YARN_ASSESSMENT_INVALID", "Fingerprint оценки фактической пряжи не совпадает.");
    return true;
  }

  function normalizeUpstream(value) {
    exactObject(value, ["project", "analysis", "technologyDecision", "garmentRequirements", "yarnRequirements", "yarnRecommendation", "yarnTargetDecision"]);
    exactObject(value.project, ["id", "revision"]); requiredText(value.project.id); positiveInteger(value.project.revision);
    for (const key of ["analysis", "technologyDecision", "garmentRequirements", "yarnRequirements", "yarnRecommendation"]) { exactObject(value[key], ["id", "revision", "fingerprint"]); requiredText(value[key].id); positiveInteger(value[key].revision); fingerprint(value[key].fingerprint); }
    if (value.yarnTargetDecision !== null) { exactObject(value.yarnTargetDecision, ["id", "revision", "fingerprint"]); requiredText(value.yarnTargetDecision.id); positiveInteger(value.yarnTargetDecision.revision); fingerprint(value.yarnTargetDecision.fingerprint); }
    return copy(value);
  }

  function defaultFlow(current) { return freeze({ contractVersion: CONTRACT_VERSION, route: ROUTES.NOT_SELECTED, candidate: null, assessment: null, confirmedActualYarn: null, assessmentHistory: [], confirmationHistory: [], upstream: current ? normalizeUpstream(current.upstream) : null, createdAt: null, updatedAt: null, canonicalFingerprint: null }); }
  function flowCore(value) { const result = copy(value); delete result.canonicalFingerprint; return result; }
  function sealFlow(value) { value.canonicalFingerprint = fnv1a32(flowCore(value)); requireValidFlow(value); return freeze(value); }
  function requireValidFlow(value) {
    exactObject(value, ["contractVersion", "route", "candidate", "assessment", "confirmedActualYarn", "assessmentHistory", "confirmationHistory", "upstream", "createdAt", "updatedAt", "canonicalFingerprint"]);
    if (value.contractVersion !== CONTRACT_VERSION || !Object.values(ROUTES).includes(value.route) || value.route === ROUTES.NOT_SELECTED || !Array.isArray(value.assessmentHistory) || !Array.isArray(value.confirmationHistory)) fail("ACTUAL_YARN_FLOW_INVALID", "Маршрут фактической пряжи повреждён.");
    if (value.candidate) requireValidCandidate(value.candidate); if (value.assessment) requireValidAssessment(value.assessment); if (value.confirmedActualYarn) requireValidConfirmed(value.confirmedActualYarn);
    normalizeUpstream(value.upstream); timestamp(value.createdAt); timestamp(value.updatedAt);
    if (!FINGERPRINT.test(value.canonicalFingerprint || "") || fnv1a32(flowCore(value)) !== value.canonicalFingerprint) fail("ACTUAL_YARN_FLOW_INVALID", "Fingerprint маршрута фактической пряжи не совпадает.");
    return true;
  }

  function confirmedCore(value) { const result = copy(value); delete result.canonicalFingerprint; return result; }
  function requireValidConfirmed(value) {
    exactObject(value, ["contractVersion", "actualYarnId", "candidateSnapshot", "assessmentSnapshot", "targetProfileSnapshot", "acceptanceOfDifferences", "upstream", "confirmedAt", "canonicalFingerprint"]);
    if (value.contractVersion !== CONTRACT_VERSION || !/^garment-actual-yarn:[0-9a-f]{8}$/.test(value.actualYarnId || "")) fail("ACTUAL_YARN_CONFIRMATION_INVALID", "Подтверждение фактической пряжи повреждено.");
    requireValidCandidate(value.candidateSnapshot); requireValidAssessment(value.assessmentSnapshot); normalizeUpstream(value.upstream); timestamp(value.confirmedAt);
    exactObject(value.acceptanceOfDifferences, ["required", "accepted", "assessmentStatus"]);
    if (value.acceptanceOfDifferences.required !== (value.assessmentSnapshot.status !== "close_to_target") || value.acceptanceOfDifferences.accepted !== true || value.acceptanceOfDifferences.assessmentStatus !== value.assessmentSnapshot.status) fail("ACTUAL_YARN_CONFIRMATION_INVALID", "Согласие с ожидаемыми отличиями не подтверждено.");
    if (!FINGERPRINT.test(value.canonicalFingerprint || "") || fnv1a32(confirmedCore(value)) !== value.canonicalFingerprint) fail("ACTUAL_YARN_CONFIRMATION_INVALID", "Fingerprint подтверждённой пряжи не совпадает.");
    return true;
  }

  function sameUpstream(left, right) {
    const a = normalizeUpstream(left); const b = normalizeUpstream(right); a.project.revision = 1; b.project.revision = 1;
    return canonicalize(a) === canonicalize(b);
  }

  function currentContext(targetInspected, aggregate, predictedRevision = null) {
    const base = targetInspected?.current?.upstream;
    if (!base) fail("ACTUAL_YARN_UPSTREAM_UNAVAILABLE", "Не удалось восстановить полную цепочку рекомендации.");
    const target = targetInspected.artifact && targetInspected.effectiveStatus === "confirmed" ? { id: targetInspected.artifact.decisionId, revision: targetInspected.artifact.revision, fingerprint: targetInspected.artifact.canonicalFingerprint } : null;
    const upstream = normalizeUpstream({ ...copy(base), project: { id: aggregate.project.project_id, revision: predictedRevision || aggregate.project.revision }, yarnTargetDecision: target });
    return freeze({ upstream, targetArtifact: target ? targetInspected.artifact : null });
  }

  function inspectFlow(flow, current, intakeArtifact) {
    if (!flow) return freeze({ flow: defaultFlow(current), effectiveStatus: "route_not_selected", current: true, errorCode: null });
    try {
      requireValidFlow(flow);
      if (!sameUpstream(flow.upstream, current.upstream)) return freeze({ flow: freeze(copy(flow)), effectiveStatus: "stale", current: false, errorCode: "ACTUAL_YARN_UPSTREAM_CHANGED" });
      if (flow.confirmedActualYarn) {
        const expected = intakeYarnFromCandidate(flow.confirmedActualYarn.candidateSnapshot);
        if (canonicalize(expected) !== canonicalize(intakeArtifact.yarn)) return freeze({ flow: freeze(copy(flow)), effectiveStatus: "stale", current: false, errorCode: "ACTUAL_YARN_INTAKE_CHANGED" });
        return freeze({ flow: freeze(copy(flow)), effectiveStatus: "confirmed", current: true, errorCode: null });
      }
      if (flow.assessment) return freeze({ flow: freeze(copy(flow)), effectiveStatus: flow.assessment.status, current: true, errorCode: null });
      if (flow.candidate) return freeze({ flow: freeze(copy(flow)), effectiveStatus: "candidate", current: true, errorCode: null });
      return freeze({ flow: freeze(copy(flow)), effectiveStatus: flow.route, current: true, errorCode: null });
    } catch (error) { return freeze({ flow: defaultFlow(current), effectiveStatus: "failed", current: false, errorCode: error.code || "ACTUAL_YARN_FLOW_INVALID" }); }
  }

  function activeArtifact(state) { return state.intakes.find((entry) => entry.intakeId === state.activeIntakeId) || null; }
  function mutateIntakeState(state, mutator, options = {}) {
    const domain = intakeDomain(); domain.requireValidState(state);
    const next = copy(state); const index = next.intakes.findIndex((entry) => entry.intakeId === next.activeIntakeId);
    if (index < 0 || next.intakes[index].status !== "draft") fail("ACTUAL_YARN_INTAKE_NOT_ACTIVE", "Фактическую пряжу нельзя изменить в устаревшем черновике.");
    const at = now(options.now); const artifact = next.intakes[index]; mutator(artifact, at);
    artifact.revision += 1; artifact.updatedAt = at; artifact.sectionStatus = domain.calculateSectionStatus(artifact); artifact.fingerprint = domain.artifactFingerprint(artifact);
    next.intakes[index] = artifact; next.revision += 1; next.updatedAt = at; next.audit.push({ event: options.event, revision: next.revision, at, details: copy(options.details || {}) }); next.fingerprint = domain.stateFingerprint(next); domain.requireValidState(next);
    return freeze(next);
  }

  function withInvalidatedEvidence(flow, at, reason) {
    const next = copy(flow);
    if (next.assessment) next.assessmentHistory.push({ snapshot: copy(next.assessment), invalidatedAt: at, reason });
    if (next.confirmedActualYarn) next.confirmationHistory.push({ snapshot: copy(next.confirmedActualYarn), invalidatedAt: at, reason });
    next.assessment = null; next.confirmedActualYarn = null;
    return next;
  }

  function selectRouteState(state, current, route, options = {}) {
    if (![ROUTES.ALREADY_HAVE, ROUTES.HELP_CHOOSE].includes(route)) fail("ACTUAL_YARN_ROUTE_INVALID", "Выбери один из двух маршрутов пряжи.");
    const existing = activeArtifact(state)?.actualYarnFlow || null;
    if (existing) { requireValidFlow(existing); if (existing.route === route) return freeze(copy(state)); if (existing.confirmedActualYarn) fail("ACTUAL_YARN_CONFIRMED_IMMUTABLE", "Сначала измени данные подтверждённой пряжи."); }
    const at = now(options.now);
    return mutateIntakeState(state, (artifact) => {
      const flow = existing ? withInvalidatedEvidence(existing, at, "route_changed") : { ...defaultFlow(current), assessmentHistory: [], confirmationHistory: [], createdAt: at };
      flow.route = route; flow.upstream = normalizeUpstream(current.upstream); flow.updatedAt = at; artifact.actualYarnFlow = copy(sealFlow(flow));
    }, { now: at, event: "actual_yarn_route_selected", details: { route } });
  }

  function saveCandidateState(state, current, input, options = {}) {
    const artifact = activeArtifact(state); const existingFlow = artifact?.actualYarnFlow;
    if (!existingFlow || existingFlow.route !== ROUTES.ALREADY_HAVE) fail("ACTUAL_YARN_ROUTE_REQUIRED", "Сначала выбери маршрут «Да, пряжа уже есть».");
    requireValidFlow(existingFlow); const at = now(options.now); const photos = artifact.additionalPhotos.filter((photo) => ["yarn_label", "yarn_appearance"].includes(photo.role));
    const normalizedInput = normalizeCandidateInput(input, photos);
    if (existingFlow.candidate && canonicalize(existingFlow.candidate.data) === canonicalize(normalizedInput)) return freeze(copy(state));
    const nextRevision = existingFlow.candidate ? existingFlow.candidate.revision + 1 : 1;
    const candidate = createCandidate(normalizedInput, { projectId: state.projectId, candidateId: existingFlow.candidate?.candidateId, revision: nextRevision, createdAt: existingFlow.candidate?.createdAt, photoRefs: photos, now: at });
    return mutateIntakeState(state, (draft) => {
      const flow = withInvalidatedEvidence(existingFlow, at, "candidate_changed"); flow.candidate = copy(candidate); flow.upstream = normalizeUpstream(current.upstream); flow.updatedAt = at; draft.actualYarnFlow = copy(sealFlow(flow)); draft.yarn = intakeDomain().normalizeYarn({ selectionStatus: "not_selected" });
    }, { now: at, event: "actual_yarn_candidate_saved", details: { candidateId: candidate.candidateId, candidateRevision: candidate.revision } });
  }

  function removePhotoState(state, current, photoId, options = {}) {
    const artifact = activeArtifact(state); const existingFlow = artifact?.actualYarnFlow;
    if (!existingFlow || existingFlow.route !== ROUTES.ALREADY_HAVE) fail("ACTUAL_YARN_ROUTE_REQUIRED", "Сначала выбери маршрут «Да, пряжа уже есть».");
    requireValidFlow(existingFlow);
    const photo = artifact.additionalPhotos.find((entry) => entry.photoId === photoId && ["yarn_label", "yarn_appearance"].includes(entry.role));
    if (!photo) fail("ACTUAL_YARN_PHOTO_NOT_FOUND", "Фотография пряжи не найдена в текущем черновике.");
    const at = now(options.now);
    return mutateIntakeState(state, (draft) => {
      draft.additionalPhotos = draft.additionalPhotos.filter((entry) => entry.photoId !== photoId);
      const remainingPhotos = draft.additionalPhotos.filter((entry) => ["yarn_label", "yarn_appearance"].includes(entry.role));
      const flow = withInvalidatedEvidence(existingFlow, at, "photo_removed");
      if (flow.candidate) {
        flow.candidate = copy(createCandidate(flow.candidate.data, {
          projectId: state.projectId,
          candidateId: flow.candidate.candidateId,
          revision: flow.candidate.revision + 1,
          createdAt: flow.candidate.createdAt,
          photoRefs: remainingPhotos,
          now: at,
        }));
      }
      flow.upstream = normalizeUpstream(current.upstream);
      flow.updatedAt = at;
      draft.actualYarnFlow = copy(sealFlow(flow));
      draft.yarn = intakeDomain().normalizeYarn({ selectionStatus: "not_selected" });
    }, { now: at, event: "actual_yarn_photo_removed", details: { photoId, role: photo.role } });
  }

  function assessState(state, current, options = {}) {
    const artifact = activeArtifact(state); const flow = artifact?.actualYarnFlow; if (!flow?.candidate || flow.route !== ROUTES.ALREADY_HAVE) fail("ACTUAL_YARN_CANDIDATE_REQUIRED", "Сначала сохрани данные имеющейся пряжи."); requireValidFlow(flow);
    if (!current.targetArtifact) fail("ACTUAL_YARN_TARGET_REQUIRED", "Сначала нужен подтверждённый выбранный ориентир.");
    if (flow.assessment && flow.assessment.candidateFingerprint === flow.candidate.canonicalFingerprint && flow.assessment.targetDecisionFingerprint === current.targetArtifact.canonicalFingerprint) return freeze(copy(state));
    const assessment = assess(flow.candidate, current.targetArtifact.selectedOptionSnapshot, { now: options.now, targetDecisionId: current.targetArtifact.decisionId, targetDecisionRevision: current.targetArtifact.revision, targetDecisionFingerprint: current.targetArtifact.canonicalFingerprint, targetOptionId: current.targetArtifact.selectedOptionId });
    const at = assessment.assessedAt;
    return mutateIntakeState(state, (draft) => { const next = withInvalidatedEvidence(flow, at, "assessment_replaced"); next.assessment = copy(assessment); next.upstream = normalizeUpstream(current.upstream); next.updatedAt = at; draft.actualYarnFlow = copy(sealFlow(next)); }, { now: at, event: "actual_yarn_assessed", details: { assessmentId: assessment.assessmentId, status: assessment.status } });
  }

  function candidateIdentity(candidate) {
    const parts = [candidate.data.manufacturer, candidate.data.name, candidate.data.article].filter(Boolean);
    return parts.length ? parts.join(" · ") : `Имеющаяся пряжа ${candidate.data.skeinWeightGrams} г / ${candidate.data.lengthMeters} м`;
  }
  function intakeYarnFromCandidate(candidate) { requireValidCandidate(candidate); return intakeDomain().normalizeYarn({ selectionStatus: "selected", name: candidateIdentity(candidate), strandCount: null, composition: candidate.data.composition, lengthMeters: candidate.data.lengthMeters, skeinMassGrams: candidate.data.skeinWeightGrams, quantityAvailable: candidate.data.availableSkeins, note: null }); }

  function confirmState(state, current, options = {}) {
    const artifact = activeArtifact(state); const flow = artifact?.actualYarnFlow; if (!flow) fail("ACTUAL_YARN_CANDIDATE_REQUIRED", "Сначала сохрани и сравни имеющуюся пряжу."); requireValidFlow(flow);
    if (flow.confirmedActualYarn && sameUpstream(flow.upstream, current.upstream)) return freeze(copy(state));
    if (!current.targetArtifact) fail("ACTUAL_YARN_TARGET_REQUIRED", "Сначала нужен подтверждённый выбранный ориентир.");
    if (!flow.candidate || !flow.assessment || flow.assessment.candidateFingerprint !== flow.candidate.canonicalFingerprint || flow.assessment.status === "insufficient_data") fail("ACTUAL_YARN_ASSESSMENT_REQUIRED", "Для подтверждения нужна текущая оценка с массой и длиной нити.");
    if (flow.candidate.data.availableSkeins === null && flow.candidate.data.totalWeightGrams === null) fail("ACTUAL_YARN_QUANTITY_REQUIRED", "Укажи количество мотков или общую массу имеющейся пряжи.");
    const requiresAcceptance = flow.assessment.status !== "close_to_target";
    if (requiresAcceptance && options.acceptDifferences !== true) fail("ACTUAL_YARN_DIFFERENCES_NOT_ACCEPTED", "Подтверди, что ожидаемые отличия понятны и допустимы.");
    const at = now(options.now); const core = { contractVersion: CONTRACT_VERSION, actualYarnId: contentId("garment-actual-yarn", { candidate: flow.candidate.canonicalFingerprint, target: current.targetArtifact?.canonicalFingerprint }), candidateSnapshot: copy(flow.candidate), assessmentSnapshot: copy(flow.assessment), targetProfileSnapshot: copy(current.targetArtifact.selectedOptionSnapshot), acceptanceOfDifferences: { required: requiresAcceptance, accepted: true, assessmentStatus: flow.assessment.status }, upstream: normalizeUpstream(current.upstream), confirmedAt: at };
    const confirmed = { ...core, canonicalFingerprint: fnv1a32(core) }; requireValidConfirmed(confirmed);
    return mutateIntakeState(state, (draft) => { const next = copy(flow); next.confirmedActualYarn = copy(confirmed); next.upstream = normalizeUpstream(current.upstream); next.updatedAt = at; draft.actualYarnFlow = copy(sealFlow(next)); draft.yarn = intakeYarnFromCandidate(flow.candidate); }, { now: at, event: "actual_yarn_confirmed", details: { actualYarnId: confirmed.actualYarnId } });
  }

  async function inspectForProject(repository, projectId) {
    const intake = await intakeDomain().ensureForProject(repository, projectId);
    const recommendation = await recommendationDomain().inspectForProject(repository, projectId);
    if (!recommendation?.artifact || recommendation.current !== true || recommendation.currentValidation?.semanticValid !== true) fail("ACTUAL_YARN_RECOMMENDATION_REQUIRED", "Нужны три текущих сохранённых профиля рекомендации.");
    const target = await targetDomain().inspectForProject(repository, projectId);
    const current = currentContext(target, intake.aggregate);
    return { ...inspectFlow(intake.artifact.actualYarnFlow || null, current, intake.artifact), intake, recommendation, target, current };
  }

  async function persist(repository, inspected, nextState, operationKind, options = {}) {
    if (nextState.fingerprint === inspected.intake.state.fingerprint) return inspected;
    await repository.updateCalculationProgress(inspected.intake.project.project_id, inspected.intake.calculation.calculation_id, intakeDomain().PROGRESS_KIND, nextState, { baseProgressRevision: inspected.intake.progress.revision, projectStage: "manual_calculation_intake_draft", operationKind, timestamp: options.now });
    return inspectForProject(repository, inspected.intake.project.project_id);
  }

  async function selectRouteForProject(repository, projectId, route, options = {}) { const inspected = await inspectForProject(repository, projectId); const predicted = currentContext(inspected.target, inspected.intake.aggregate, inspected.intake.aggregate.project.revision + 1); return persist(repository, inspected, selectRouteState(inspected.intake.state, predicted, route, options), "GARMENT_ACTUAL_YARN_ROUTE_SELECTED", options); }
  async function saveCandidateForProject(repository, projectId, input, options = {}) { const inspected = await inspectForProject(repository, projectId); const predicted = currentContext(inspected.target, inspected.intake.aggregate, inspected.intake.aggregate.project.revision + 1); return persist(repository, inspected, saveCandidateState(inspected.intake.state, predicted, input, options), "GARMENT_ACTUAL_YARN_CANDIDATE_SAVED", options); }
  async function removePhotoForProject(repository, projectId, photoId, options = {}) {
    const inspected = await inspectForProject(repository, projectId);
    const predicted = currentContext(inspected.target, inspected.intake.aggregate, inspected.intake.aggregate.project.revision + 1);
    const nextState = removePhotoState(inspected.intake.state, predicted, photoId, options);
    await repository.deletePhotoAndUpdateCalculationProgress(
      projectId,
      photoId,
      inspected.intake.calculation.calculation_id,
      intakeDomain().PROGRESS_KIND,
      nextState,
      {
        baseProgressRevision: inspected.intake.progress.revision,
        expectedPurpose: intakeDomain().PHOTO_PURPOSE,
        projectStage: "manual_calculation_intake_draft",
        operationKind: "GARMENT_ACTUAL_YARN_PHOTO_DELETED",
        timestamp: options.now,
      },
    );
    return inspectForProject(repository, projectId);
  }
  async function assessForProject(repository, projectId, options = {}) { const inspected = await inspectForProject(repository, projectId); const predicted = currentContext(inspected.target, inspected.intake.aggregate, inspected.intake.aggregate.project.revision + 1); return persist(repository, inspected, assessState(inspected.intake.state, predicted, options), "GARMENT_ACTUAL_YARN_ASSESSED", options); }
  async function confirmForProject(repository, projectId, options = {}) { const inspected = await inspectForProject(repository, projectId); if (inspected.effectiveStatus === "confirmed") return inspected; const predicted = currentContext(inspected.target, inspected.intake.aggregate, inspected.intake.aggregate.project.revision + 1); return persist(repository, inspected, confirmState(inspected.intake.state, predicted, options), "GARMENT_ACTUAL_YARN_CONFIRMED", options); }

  const api = freeze({ CONTRACT_VERSION, ROUTES, SURFACES, ASSESSMENT_STATUSES, metersPer100g, normalizeCandidateInput, createCandidate, requireValidCandidate, assess, requireValidAssessment, requireValidFlow, requireValidConfirmed, defaultFlow, inspectFlow, currentContext, selectRouteState, saveCandidateState, removePhotoState, assessState, confirmState, intakeYarnFromCandidate, inspectForProject, selectRouteForProject, saveCandidateForProject, removePhotoForProject, assessForProject, confirmForProject, fingerprint: fnv1a32 });
  globalObject.YarnAIGarmentActualYarn = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
