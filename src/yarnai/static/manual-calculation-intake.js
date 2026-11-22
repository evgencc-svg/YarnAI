"use strict";

(function initializeManualCalculationIntake(globalObject) {
  const CONTRACT_VERSION = "MANUAL_CALCULATION_INTAKE_V1";
  const SCHEMA_VERSION = 1;
  const PROGRESS_KIND = "MANUAL_CALCULATION_INTAKE";
  const PHOTO_PURPOSE = "MANUAL_CALCULATION_INTAKE";
  const ROUTE_KIND = "manual_knitting";
  const MANUAL_OPTION_NAMES = Object.freeze([
    "Вязание сверху вниз с рукавами реглан",
    "Вязание отдельными деталями с втачным рукавом",
  ]);
  const INDUSTRIAL_OPTION_NAME = "Промышленное вязание деталей точно по форме";
  const INDUSTRIAL_MESSAGE = "Yarn AI V1 пока не рассчитывает промышленное вязание. Этот вариант сохранён как информационный.";
  const PHOTO_ROLES = Object.freeze({
    front: "Вид спереди",
    back: "Вид сзади",
    side: "Вид сбоку",
    detail: "Деталь",
    yarn_label: "Этикетка пряжи",
    yarn_appearance: "Моток или нить",
    swatch: "Контрольный образец",
  });
  const BODY_MEASUREMENTS = Object.freeze([
    "bust_circumference", "waist_circumference", "hip_circumference", "body_length",
    "body_shoulder_width", "body_back_width",
  ]);
  const GARMENT_MEASUREMENTS = Object.freeze([
    "finished_bust_circumference", "finished_body_length", "finished_sleeve_length",
    "finished_upper_arm_circumference", "finished_cuff_circumference", "finished_neck_width",
    "finished_front_neck_depth", "finished_waist_circumference", "finished_hip_circumference",
    "finished_yoke_depth", "finished_armhole_depth",
  ]);
  const EASE_MEASUREMENTS = Object.freeze(["bust_ease"]);
  const FIT_PREFERENCES = Object.freeze({
    body_shaping_preference: Object.freeze(["straight", "shaped"]),
    neckline_style: Object.freeze(["round_neck", "v_neck", "polo_collar_with_placket"]),
    closure_style: Object.freeze(["none", "short_front_placket", "full_front"]),
  });
  const CONSTRUCTION_INPUTS = Object.freeze({
    hem_finish: Object.freeze(["rib", "folded", "plain"]),
    cuff_finish: Object.freeze(["rib", "folded", "plain"]),
  });

  class ManualCalculationIntakeError extends Error {
    constructor(code, message, details = {}) {
      super(message);
      this.name = "ManualCalculationIntakeError";
      this.code = code;
      this.details = details;
      this.userMessage = message;
    }
  }

  function classifyTechnologyHandoff(handoff) {
    if (!handoff || handoff.isCurrent !== true || handoff.decisionStatus !== "confirmed") return "not_confirmed";
    if (handoff.selectedConstructionIdentity === "seamed_set_in_sleeve") return "manual";
    const name = handoff.selectedOption?.name || null;
    if (MANUAL_OPTION_NAMES.includes(name)) return "manual";
    if (name === INDUSTRIAL_OPTION_NAME) return "industrial";
    return "unsupported";
  }

  function createInitialState({ projectId, calculationId, handoff, now }) {
    requireUuid(projectId, "INTAKE_SCOPE_INVALID");
    requireUuid(calculationId, "INTAKE_SCOPE_INVALID");
    requireManualHandoff(handoff);
    const at = timestamp(now);
    const requirementsProfile = requireResolvedRequirementsProfile(handoff);
    const yarnRequirementsProfile = requireResolvedYarnRequirementsProfile(handoff);
    const artifact = createArtifact(handoff, requirementsProfile, yarnRequirementsProfile, at);
    const state = {
      contractVersion: CONTRACT_VERSION,
      schemaVersion: SCHEMA_VERSION,
      kind: PROGRESS_KIND,
      projectId,
      calculationId,
      revision: 1,
      status: "draft",
      activeIntakeId: artifact.intakeId,
      intakes: [artifact],
      audit: [{ event: "manual_intake_created", revision: 1, at, details: { technologyDecisionId: artifact.source.technologyDecisionId } }],
      createdAt: at,
      updatedAt: at,
      fingerprint: "",
    };
    state.fingerprint = stateFingerprint(state);
    requireValidState(state);
    return freeze(state);
  }

  function createArtifact(handoff, requirementsProfile, yarnRequirementsProfile, at) {
    const artifact = {
      intakeId: makeId("manual-intake"),
      revision: 1,
      status: "draft",
      routeKind: ROUTE_KIND,
      source: sourceBinding(handoff, requirementsProfile, yarnRequirementsProfile),
      garmentRequirementsProfile: copy(requirementsProfile),
      yarnRequirementsProfile: copy(yarnRequirementsProfile),
      targetSizing: {
        selectedSize: null,
        bodyMeasurements: [],
        finishedGarmentMeasurements: [],
        ease: [],
        fitPreferences: emptyChoiceValues(FIT_PREFERENCES),
      },
      constructionInputs: emptyChoiceValues(CONSTRUCTION_INPUTS),
      yarn: {
        selectionStatus: "not_selected",
        name: null,
        strandCount: null,
        composition: null,
        lengthMeters: null,
        skeinMassGrams: null,
        quantityAvailable: null,
        note: null,
      },
      needles: {
        selectionStatus: "not_selected",
        primaryMm: null,
        additionalMm: [],
      },
      gauge: {
        sourceMeasurement: {
          stitches: null,
          widthCm: null,
          rows: null,
          heightCm: null,
          needleSizeMm: null,
          afterTreatment: "unknown",
        },
        normalizedPer10Cm: null,
      },
      additionalPhotos: [],
      notes: null,
      sectionStatus: emptySectionStatus(),
      staleReasons: [],
      supersededByDecisionId: null,
      createdAt: at,
      updatedAt: at,
      fingerprint: "",
    };
    artifact.fingerprint = artifactFingerprint(artifact);
    return artifact;
  }

  function updateDraft(state, input, options = {}) {
    const current = validCopy(state);
    const index = activeIndex(current);
    if (index < 0 || current.intakes[index].status !== "draft") fail("INTAKE_NOT_ACTIVE", "Текущий черновик больше не связан с подтверждённой технологией.");
    const at = timestamp(options.now);
    const previous = current.intakes[index];
    const nextArtifact = copy(previous);
    const value = input && typeof input === "object" && !Array.isArray(input) ? input : {};
    nextArtifact.targetSizing = normalizeTargetSizing(value.targetSizing || {});
    nextArtifact.constructionInputs = normalizeChoiceValues(value.constructionInputs, CONSTRUCTION_INPUTS);
    nextArtifact.yarn = normalizeYarn(value.yarn || {});
    nextArtifact.needles = normalizeNeedles(value.needles || {});
    nextArtifact.gauge = normalizeGauge(value.gauge || {});
    nextArtifact.notes = nullableText(value.notes, 8000);
    nextArtifact.sectionStatus = calculateSectionStatus(nextArtifact);
    const comparable = copy(nextArtifact);
    comparable.revision = previous.revision;
    comparable.updatedAt = previous.updatedAt;
    comparable.fingerprint = previous.fingerprint;
    if (canonicalize(comparable) === canonicalize(previous)) return freeze(current);
    nextArtifact.revision = previous.revision + 1;
    nextArtifact.updatedAt = at;
    nextArtifact.fingerprint = artifactFingerprint(nextArtifact);
    current.intakes[index] = nextArtifact;
    return commit(current, "manual_intake_draft_saved", at, { intakeId: nextArtifact.intakeId });
  }

  function attachPhoto(state, photo, role, options = {}) {
    const current = validCopy(state);
    const index = activeIndex(current);
    if (index < 0) fail("INTAKE_NOT_ACTIVE", "Дополнительную фотографию нельзя связать с устаревшим черновиком.");
    if (!Object.prototype.hasOwnProperty.call(PHOTO_ROLES, role)) fail("PHOTO_ROLE_INVALID", "Выбери назначение фотографии.");
    const normalized = normalizePhoto(photo, role);
    const artifact = copy(current.intakes[index]);
    if (artifact.additionalPhotos.some((entry) => entry.photoId === normalized.photoId && entry.role === role)) return freeze(current);
    artifact.additionalPhotos.push(normalized);
    artifact.additionalPhotos.sort((left, right) => `${left.role}:${left.photoId}`.localeCompare(`${right.role}:${right.photoId}`));
    artifact.sectionStatus = calculateSectionStatus(artifact);
    artifact.revision += 1;
    artifact.updatedAt = timestamp(options.now);
    artifact.fingerprint = artifactFingerprint(artifact);
    current.intakes[index] = artifact;
    return commit(current, "manual_intake_photo_attached", artifact.updatedAt, { intakeId: artifact.intakeId, photoId: normalized.photoId, role });
  }

  function reconcileState(state, handoff, requirementsProfile = null, options = {}) {
    const current = validCopy(state);
    const index = activeIndex(current);
    if (index < 0) return freeze(current);
    const artifact = current.intakes[index];
    const profile = requirementsProfile || profileForHandoff(handoff);
    const yarnProfile = handoff ? yarnProfileForHandoff(handoff) : null;
    if (classifyTechnologyHandoff(handoff) === "manual" && profile?.status === "resolved" && yarnProfile?.status === "resolved" && sameBinding(artifact.source, sourceBinding(handoff, profile, yarnProfile))) return freeze(current);
    const at = timestamp(options.now);
    const stale = copy(artifact);
    stale.status = "stale";
    stale.staleReasons = staleReasons(artifact.source, handoff);
    stale.supersededByDecisionId = classifyTechnologyHandoff(handoff) === "manual" ? handoff.technologyDecisionId : null;
    stale.revision += 1;
    stale.updatedAt = at;
    stale.fingerprint = artifactFingerprint(stale);
    current.intakes[index] = stale;
    current.activeIntakeId = null;
    current.status = "stale";
    return commit(current, "manual_intake_stale", at, { intakeId: stale.intakeId, reasons: stale.staleReasons });
  }

  function appendCurrentDraft(state, handoff, requirementsProfile = null, options = {}) {
    requireManualHandoff(handoff);
    const profile = requirementsProfile || requireResolvedRequirementsProfile(handoff);
    const yarnProfile = requireResolvedYarnRequirementsProfile(handoff);
    const current = validCopy(state);
    if (activeIndex(current) >= 0) fail("INTAKE_ALREADY_ACTIVE", "Для текущего решения уже существует активный черновик.");
    const at = timestamp(options.now);
    const artifact = createArtifact(handoff, profile, yarnProfile, at);
    current.intakes.push(artifact);
    current.activeIntakeId = artifact.intakeId;
    current.status = "draft";
    return commit(current, "manual_intake_revision_created", at, { intakeId: artifact.intakeId, technologyDecisionId: artifact.source.technologyDecisionId });
  }

  function normalizeTargetSizing(value) {
    return {
      selectedSize: nullableText(value.selectedSize, 120),
      bodyMeasurements: measurementList(value.bodyMeasurements, BODY_MEASUREMENTS, "body", false),
      finishedGarmentMeasurements: measurementList(value.finishedGarmentMeasurements, GARMENT_MEASUREMENTS, "finished_garment", false),
      ease: measurementList(value.ease, EASE_MEASUREMENTS, "ease", true),
      fitPreferences: normalizeChoiceValues(value.fitPreferences, FIT_PREFERENCES),
    };
  }

  function normalizeChoiceValues(value, contract) {
    const source = value && typeof value === "object" && !Array.isArray(value) ? value : {};
    return Object.fromEntries(Object.entries(contract).map(([field, allowed]) => {
      const candidate = nullableText(source[field], 120);
      if (candidate !== null && !allowed.includes(candidate)) fail("CHOICE_INVALID", "Выбранное значение не поддерживается контрактом изделия.", { field, candidate });
      return [field, candidate];
    }));
  }

  function emptyChoiceValues(contract) {
    return Object.fromEntries(Object.keys(contract).map((field) => [field, null]));
  }

  function measurementList(value, allowedKinds, measurementType, allowSigned) {
    const source = value && typeof value === "object" && !Array.isArray(value) ? value : {};
    return allowedKinds.flatMap((kind) => {
      const amount = optionalNumber(source[kind], { allowSigned, maximum: 500 });
      return amount === null ? [] : [{ kind, measurementType, value: amount, unit: "cm", provenance: { authority: "user", source: "manual_input" } }];
    });
  }

  function normalizeYarn(value) {
    const selectionStatus = value.selectionStatus === "selected" ? "selected" : "not_selected";
    return {
      selectionStatus,
      name: selectionStatus === "selected" ? nullableText(value.name, 300) : null,
      strandCount: selectionStatus === "selected" ? optionalPositiveInteger(value.strandCount, 100) : null,
      composition: selectionStatus === "selected" ? nullableText(value.composition, 500) : null,
      lengthMeters: selectionStatus === "selected" ? optionalNumber(value.lengthMeters, { maximum: 100000 }) : null,
      skeinMassGrams: selectionStatus === "selected" ? optionalNumber(value.skeinMassGrams, { maximum: 100000 }) : null,
      quantityAvailable: selectionStatus === "selected" ? optionalNumber(value.quantityAvailable, { maximum: 100000 }) : null,
      note: selectionStatus === "selected" ? nullableText(value.note, 2000) : null,
    };
  }

  function normalizeNeedles(value) {
    const selectionStatus = value.selectionStatus === "selected" ? "selected" : "not_selected";
    const rawAdditional = Array.isArray(value.additionalMm) ? value.additionalMm : String(value.additionalMm || "").split(",");
    const additionalMm = selectionStatus === "selected"
      ? [...new Set(rawAdditional.map((entry) => optionalNumber(entry, { maximum: 30 })).filter((entry) => entry !== null))].sort((a, b) => a - b)
      : [];
    return {
      selectionStatus,
      primaryMm: selectionStatus === "selected" ? optionalNumber(value.primaryMm, { maximum: 30 }) : null,
      additionalMm,
    };
  }

  // Old drafts have no explicit source and keep their measured-swatch representation.
  function gaugeBasis(gauge) {
    if (gauge?.source !== "manufacturer") return gauge?.sourceMeasurement || {};
    const label = gauge.label || {};
    return { stitches: label.stitchesPer10Cm, rows: label.rowsPer10Cm, widthCm: 10, heightCm: 10, needleSizeMm: label.recommendedNeedleMm };
  }

  function normalizeGauge(value) {
    const labelInput = value.label || {};
    const label = {
      stitchesPer10Cm: optionalNumber(labelInput.stitchesPer10Cm, { maximum: 10000 }),
      rowsPer10Cm: optionalNumber(labelInput.rowsPer10Cm, { maximum: 10000 }),
      recommendedNeedleMm: optionalNumber(labelInput.recommendedNeedleMm, { maximum: 30 }),
    };
    const source = value.sourceMeasurement && typeof value.sourceMeasurement === "object" ? value.sourceMeasurement : value;
    const sourceMeasurement = {
      stitches: optionalNumber(source.stitches, { maximum: 10000 }),
      widthCm: optionalNumber(source.widthCm, { maximum: 1000 }),
      rows: optionalNumber(source.rows, { maximum: 10000 }),
      heightCm: optionalNumber(source.heightCm, { maximum: 1000 }),
      needleSizeMm: optionalNumber(source.needleSizeMm, { maximum: 30 }),
      afterTreatment: ["yes", "no", "unknown"].includes(source.afterTreatment) ? source.afterTreatment : "unknown",
    };
    if (value.source === "manufacturer") {
      const hasMeasurement = Object.entries(sourceMeasurement).some(([key, entry]) =>
        key === "afterTreatment" ? entry !== "unknown" : entry !== null);
      const { stitchesPer10Cm, rowsPer10Cm } = label;
      return {
        source: "manufacturer", label,
        ...(hasMeasurement ? { sourceMeasurement } : {}),
        normalizedPer10Cm: stitchesPer10Cm && rowsPer10Cm ? { stitchesPer10Cm, rowsPer10Cm, unit: "10_cm", derivation: "manufacturer_label" } : null,
      };
    }
    const complete = [sourceMeasurement.stitches, sourceMeasurement.widthCm, sourceMeasurement.rows, sourceMeasurement.heightCm].every((entry) => entry !== null);
    return {
      sourceMeasurement,
      ...(Object.values(label).some(entry => entry !== null) ? { label } : {}),
      normalizedPer10Cm: complete ? {
        stitchesPer10Cm: round(sourceMeasurement.stitches * 10 / sourceMeasurement.widthCm, 4),
        rowsPer10Cm: round(sourceMeasurement.rows * 10 / sourceMeasurement.heightCm, 4),
        unit: "10_cm",
        derivation: "deterministic_from_source_measurement",
      } : null,
    };
  }

  function calculateSectionStatus(artifact) {
    const sizing = artifact.targetSizing;
    return {
      targetSizing: Boolean(sizing.selectedSize || sizing.bodyMeasurements.length || sizing.finishedGarmentMeasurements.length || sizing.ease.length
        || Object.values(sizing.fitPreferences || {}).some((entry) => entry !== null)
        || Object.values(artifact.constructionInputs || {}).some((entry) => entry !== null)),
      yarn: artifact.yarn.selectionStatus === "selected",
      needles: artifact.needles.selectionStatus === "selected",
      gauge: artifact.gauge.normalizedPer10Cm !== null,
      additionalPhotos: artifact.additionalPhotos.length > 0,
      notes: artifact.notes !== null,
    };
  }

  function emptySectionStatus() {
    return { targetSizing: false, yarn: false, needles: false, gauge: false, additionalPhotos: false, notes: false };
  }

  function sourceBinding(handoff, requirementsProfile = null, yarnRequirementsProfile = null) {
    requireManualHandoff(handoff);
    const profile = requirementsProfile || requireResolvedRequirementsProfile(handoff);
    const requirements = requireRequirementsDomain().compactBinding(profile);
    const yarnProfile = yarnRequirementsProfile || requireResolvedYarnRequirementsProfile(handoff);
    const yarnRequirements = requireYarnRequirementsDomain().compactBinding(yarnProfile);
    return {
      projectId: handoff.projectId,
      projectRevision: handoff.sourceProjectRevision,
      analysisId: handoff.analysisId,
      analysisRequestId: handoff.analysisRequestId,
      sourceAnalysisFingerprint: handoff.sourceAnalysisFingerprint,
      sourceRequestFingerprint: handoff.sourceRequestFingerprint,
      technologyDecisionId: handoff.technologyDecisionId,
      technologyDecisionRevision: handoff.technologyDecisionRevision,
      selectedOptionId: handoff.selectedOptionId,
      selectedOptionName: handoff.selectedOption.name,
      confirmedAt: handoff.confirmedAt,
      garmentRequirements: requirements,
      yarnRequirements,
    };
  }

  function staleReasons(source, handoff) {
    if (!handoff || handoff.isCurrent !== true) return ["technology_decision_not_current"];
    const reasons = [];
    if (source.sourceAnalysisFingerprint !== handoff.sourceAnalysisFingerprint) reasons.push("analysis_changed");
    if (source.technologyDecisionId !== handoff.technologyDecisionId || source.technologyDecisionRevision !== handoff.technologyDecisionRevision) reasons.push("technology_decision_changed");
    if (classifyTechnologyHandoff(handoff) !== "manual") reasons.push("route_not_manual");
    return reasons.length ? reasons : ["source_binding_changed"];
  }

  function requireManualHandoff(handoff) {
    const route = classifyTechnologyHandoff(handoff);
    if (route === "industrial") fail("INDUSTRIAL_ROUTE_UNSUPPORTED", INDUSTRIAL_MESSAGE);
    if (route !== "manual") fail("MANUAL_DECISION_REQUIRED", "Сначала подтверди один из двух ручных способов вязания в исходном анализе.");
    const requiredText = ["projectId", "analysisId", "analysisRequestId", "technologyDecisionId", "selectedOptionId", "sourceAnalysisFingerprint", "sourceRequestFingerprint", "confirmedAt"];
    if (requiredText.some((field) => typeof handoff[field] !== "string" || !handoff[field])) fail("HANDOFF_IDENTITY_INVALID", "Связка с подтверждённым решением неполна.");
    requireUuid(handoff.projectId, "HANDOFF_IDENTITY_INVALID");
    if (!Number.isSafeInteger(handoff.sourceProjectRevision) || handoff.sourceProjectRevision < 1 || !Number.isSafeInteger(handoff.technologyDecisionRevision) || handoff.technologyDecisionRevision < 1) fail("HANDOFF_IDENTITY_INVALID", "Revision подтверждённого решения повреждена.");
    return handoff;
  }

  function requireRequirementsDomain() {
    const domain = globalObject.YarnAIGarmentMeasurementRequirements;
    if (!domain?.resolveFromTechnologyDecision || !domain?.requireValidProfile) fail("GARMENT_REQUIREMENTS_DOMAIN_UNAVAILABLE", "Модуль профиля мерок изделия не загружен.");
    return domain;
  }

  function profileForHandoff(handoff) {
    return requireRequirementsDomain().resolveFromTechnologyDecision(handoff);
  }

  function requireYarnRequirementsDomain() {
    const domain = globalObject.YarnAIGarmentYarnRequirements;
    if (!domain?.resolveFromTechnologyDecision || !domain?.requireValidProfile) fail("YARN_REQUIREMENTS_DOMAIN_UNAVAILABLE", "Модуль профиля требований к пряже не загружен.");
    return domain;
  }

  function yarnProfileForHandoff(handoff) {
    return requireYarnRequirementsDomain().resolveFromTechnologyDecision(handoff);
  }

  function requireResolvedRequirementsProfile(handoff) {
    const profile = profileForHandoff(handoff);
    if (profile.status !== "resolved" || profile.abstain) fail("GARMENT_REQUIREMENTS_UNRESOLVED", profile.firstAction || "Профиль необходимых мерок не разрешён.");
    requireRequirementsDomain().requireValidProfile(profile);
    return profile;
  }

  function requireResolvedYarnRequirementsProfile(handoff) {
    const profile = yarnProfileForHandoff(handoff);
    if (profile.status !== "resolved" || profile.abstain) fail("YARN_REQUIREMENTS_UNRESOLVED", profile.firstAction || "Профиль требований к пряже не разрешён.");
    requireYarnRequirementsDomain().requireValidProfile(profile);
    return profile;
  }

  function bindRequirementsProfile(state, handoff, requirementsProfile, options = {}) {
    const current = validCopy(state);
    const index = activeIndex(current);
    if (index < 0) return freeze(current);
    const artifact = current.intakes[index];
    const binding = requireRequirementsDomain().compactBinding(requirementsProfile);
    const yarnRequirementsProfile = requireResolvedYarnRequirementsProfile(handoff);
    const yarnBinding = requireYarnRequirementsDomain().compactBinding(yarnRequirementsProfile);
    if (artifact.garmentRequirementsProfile && artifact.yarnRequirementsProfile
        && sameBinding(artifact.source?.garmentRequirements, binding)
        && sameBinding(artifact.source?.yarnRequirements, yarnBinding)) return freeze(current);
    const sameExistingDecision = artifact.source?.technologyDecisionId === handoff.technologyDecisionId
      && artifact.source?.technologyDecisionRevision === handoff.technologyDecisionRevision
      && artifact.source?.sourceAnalysisFingerprint === handoff.sourceAnalysisFingerprint
      && artifact.source?.selectedOptionId === handoff.selectedOptionId;
    if (!sameExistingDecision) return freeze(current);
    const nextArtifact = copy(artifact);
    nextArtifact.garmentRequirementsProfile = copy(requirementsProfile);
    nextArtifact.yarnRequirementsProfile = copy(yarnRequirementsProfile);
    nextArtifact.source = sourceBinding(handoff, requirementsProfile, yarnRequirementsProfile);
    nextArtifact.targetSizing.fitPreferences = normalizeChoiceValues(nextArtifact.targetSizing.fitPreferences, FIT_PREFERENCES);
    nextArtifact.constructionInputs = normalizeChoiceValues(nextArtifact.constructionInputs, CONSTRUCTION_INPUTS);
    nextArtifact.yarn = normalizeYarn(nextArtifact.yarn || {});
    nextArtifact.revision += 1;
    nextArtifact.updatedAt = timestamp(options.now);
    nextArtifact.fingerprint = artifactFingerprint(nextArtifact);
    current.intakes[index] = nextArtifact;
    return commit(current, "manual_intake_requirements_bound", nextArtifact.updatedAt, { intakeId: nextArtifact.intakeId, garmentProfileFingerprint: requirementsProfile.canonicalFingerprint, yarnProfileFingerprint: yarnRequirementsProfile.canonicalFingerprint });
  }

  function requireValidState(value) {
    if (!value || value.contractVersion !== CONTRACT_VERSION || value.schemaVersion !== SCHEMA_VERSION || value.kind !== PROGRESS_KIND) fail("INTAKE_STATE_INVALID", "Состояние подготовки данных имеет неверную версию.");
    requireUuid(value.projectId, "INTAKE_STATE_INVALID");
    requireUuid(value.calculationId, "INTAKE_STATE_INVALID");
    if (!Number.isSafeInteger(value.revision) || value.revision < 1 || !["draft", "stale"].includes(value.status) || !Array.isArray(value.intakes) || !value.intakes.length || !Array.isArray(value.audit)) fail("INTAKE_STATE_INVALID", "Состояние подготовки данных повреждено.");
    const ids = new Set();
    value.intakes.forEach((artifact) => {
      requireUuid(artifact.intakeId, "INTAKE_STATE_INVALID");
      if (ids.has(artifact.intakeId) || !["draft", "stale"].includes(artifact.status) || artifact.routeKind !== ROUTE_KIND || artifact.source?.projectId !== value.projectId) fail("INTAKE_STATE_INVALID", "История черновиков повреждена.");
      ids.add(artifact.intakeId);
      if (artifact.garmentRequirementsProfile) {
        requireRequirementsDomain().requireValidProfile(artifact.garmentRequirementsProfile);
        if (!sameBinding(artifact.source?.garmentRequirements, requireRequirementsDomain().compactBinding(artifact.garmentRequirementsProfile))) fail("INTAKE_REQUIREMENTS_BINDING_MISMATCH", "Черновик связан с другим профилем мерок.");
      }
      if (artifact.yarnRequirementsProfile) {
        requireYarnRequirementsDomain().requireValidProfile(artifact.yarnRequirementsProfile);
        if (!sameBinding(artifact.source?.yarnRequirements, requireYarnRequirementsDomain().compactBinding(artifact.yarnRequirementsProfile))) fail("INTAKE_YARN_REQUIREMENTS_BINDING_MISMATCH", "Черновик связан с другим профилем требований к пряже.");
      }
      if (artifactFingerprint(artifact) !== artifact.fingerprint) fail("INTAKE_ARTIFACT_FINGERPRINT_MISMATCH", "Черновик не прошёл проверку целостности.");
    });
    const active = value.activeIntakeId === null ? null : value.intakes.find((entry) => entry.intakeId === value.activeIntakeId);
    if ((value.status === "draft" && (!active || active.status !== "draft")) || (value.status === "stale" && value.activeIntakeId !== null)) fail("INTAKE_STATE_INVALID", "Активный черновик и status не совпадают.");
    if (stateFingerprint(value) !== value.fingerprint) fail("INTAKE_STATE_FINGERPRINT_MISMATCH", "Состояние подготовки данных не прошло проверку целостности.");
    timestamp(value.createdAt); timestamp(value.updatedAt);
    return true;
  }

  async function ensureForProject(repository, projectId) {
    let aggregate = await repository.getProject(projectId);
    const calculation = activeCalculation(aggregate);
    if (!calculation || calculation.request?.workflow_kind !== "garment_reference") fail("CALCULATION_MISMATCH", "Проект не относится к пути изделия по фотографии.");
    const handoff = handoffFromAggregate(aggregate, calculation.calculation_id);
    requireManualHandoff(handoff);
    const requirementsProfile = requireResolvedRequirementsProfile(handoff);
    requireResolvedYarnRequirementsProfile(handoff);
    let progress = findProgress(aggregate, calculation.calculation_id);
    if (!progress) {
      const initial = createInitialState({ projectId, calculationId: calculation.calculation_id, handoff });
      progress = await repository.ensureCalculationProgress(projectId, calculation.calculation_id, PROGRESS_KIND, initial, { projectStage: "manual_calculation_intake_draft", operationKind: "MANUAL_CALCULATION_INTAKE_CREATED" });
      aggregate = await repository.getProject(projectId);
      return inspectedResult(aggregate, calculation.calculation_id);
    }
    requireValidState(progress.state);
    let next = bindRequirementsProfile(progress.state, handoff, requirementsProfile);
    next = reconcileState(next, handoff, requirementsProfile);
    if (next.activeIntakeId === null) next = appendCurrentDraft(next, handoff, requirementsProfile);
    if (next.fingerprint !== progress.state.fingerprint) {
      await repository.updateCalculationProgress(projectId, calculation.calculation_id, PROGRESS_KIND, next, { baseProgressRevision: progress.revision, projectStage: "manual_calculation_intake_draft", operationKind: "MANUAL_CALCULATION_INTAKE_REBOUND" });
      aggregate = await repository.getProject(projectId);
    }
    return inspectedResult(aggregate, calculation.calculation_id);
  }

  async function saveDraftForProject(repository, projectId, input) {
    const inspected = await ensureForProject(repository, projectId);
    const next = updateDraft(inspected.state, input);
    if (next.fingerprint === inspected.state.fingerprint) return inspected;
    await repository.updateCalculationProgress(projectId, inspected.calculation.calculation_id, PROGRESS_KIND, next, { baseProgressRevision: inspected.progress.revision, projectStage: "manual_calculation_intake_draft", operationKind: "MANUAL_CALCULATION_INTAKE_DRAFT_SAVED" });
    const aggregate = await repository.getProject(projectId);
    return inspectedResult(aggregate, inspected.calculation.calculation_id);
  }

  async function addPhotoForProject(repository, projectId, file, role) {
    const inspected = await ensureForProject(repository, projectId);
    if (!(file instanceof Blob) || !["image/jpeg", "image/png", "image/webp"].includes(file.type) || file.size <= 0) fail("PHOTO_INVALID", "Поддерживаются непустые JPEG, PNG и WebP фотографии.");
    if (!Object.prototype.hasOwnProperty.call(PHOTO_ROLES, role)) fail("PHOTO_ROLE_INVALID", "Выбери назначение фотографии.");
    const photo = await repository.addPhoto(projectId, file, { purpose: PHOTO_PURPOSE, calculation_id: inspected.calculation.calculation_id, display_name: file.name || PHOTO_ROLES[role] });
    const next = attachPhoto(inspected.state, photo, role);
    if (next.fingerprint !== inspected.state.fingerprint) {
      await repository.updateCalculationProgress(projectId, inspected.calculation.calculation_id, PROGRESS_KIND, next, { baseProgressRevision: inspected.progress.revision, projectStage: "manual_calculation_intake_draft", operationKind: "MANUAL_CALCULATION_INTAKE_PHOTO_ATTACHED" });
    }
    const aggregate = await repository.getProject(projectId);
    return inspectedResult(aggregate, inspected.calculation.calculation_id);
  }

  async function reconcileForProject(repository, projectId) {
    const aggregate = await repository.getProject(projectId);
    const calculation = activeCalculation(aggregate);
    if (!calculation) return null;
    const progress = findProgress(aggregate, calculation.calculation_id);
    if (!progress) return null;
    requireValidState(progress.state);
    let handoff = null;
    try { handoff = handoffFromAggregate(aggregate, calculation.calculation_id); } catch { handoff = null; }
    const requirementsProfile = handoff ? profileForHandoff(handoff) : null;
    const next = reconcileState(progress.state, handoff, requirementsProfile);
    if (next.fingerprint === progress.state.fingerprint) return inspectedResult(aggregate, calculation.calculation_id);
    await repository.updateCalculationProgress(projectId, calculation.calculation_id, PROGRESS_KIND, next, { baseProgressRevision: progress.revision, projectStage: "manual_calculation_intake_stale", operationKind: "MANUAL_CALCULATION_INTAKE_STALE" });
    return inspectedResult(await repository.getProject(projectId), calculation.calculation_id);
  }

  function inspectedResult(aggregate, calculationId) {
    const calculation = aggregate.calculations.find((entry) => entry.calculation_id === calculationId);
    const progress = findProgress(aggregate, calculationId);
    if (!progress) fail("INTAKE_NOT_FOUND", "Черновик подготовки данных не найден.");
    requireValidState(progress.state);
    const artifact = progress.state.intakes.find((entry) => entry.intakeId === progress.state.activeIntakeId) || progress.state.intakes.at(-1);
    return { aggregate, project: aggregate.project, calculation, progress, state: freeze(copy(progress.state)), artifact: freeze(copy(artifact)) };
  }

  function handoffFromAggregate(aggregate, calculationId) {
    const garmentDomain = globalObject.YarnAIGarmentReferenceAnalysis;
    if (!garmentDomain?.technologyDecisionHandoff) fail("GARMENT_DOMAIN_UNAVAILABLE", "Модуль исходного анализа не загружен.");
    const garment = aggregate.progress.find((entry) => entry.kind === garmentDomain.PROGRESS_KIND && entry.calculation_id === calculationId && entry.epoch === 1);
    if (!garment) fail("GARMENT_ANALYSIS_NOT_FOUND", "Исходный анализ изделия не найден.");
    return garmentDomain.technologyDecisionHandoff(garment.state);
  }

  function findProgress(aggregate, calculationId) {
    return aggregate.progress.find((entry) => entry.kind === PROGRESS_KIND && entry.calculation_id === calculationId && entry.epoch === 1) || null;
  }

  function activeCalculation(aggregate) {
    return aggregate.calculations.find((entry) => entry.calculation_id === aggregate.project.active_calculation_id) || null;
  }

  function activeIndex(state) {
    return state.activeIntakeId === null ? -1 : state.intakes.findIndex((entry) => entry.intakeId === state.activeIntakeId);
  }

  function normalizePhoto(photo, role) {
    const photoId = photo?.photo_id || photo?.photoId;
    const sha256 = photo?.sha256;
    const mimeType = photo?.source_mime || photo?.mimeType;
    requireUuid(photoId, "PHOTO_IDENTITY_INVALID");
    if (!/^[0-9a-f]{64}$/i.test(sha256 || "") || !["image/jpeg", "image/png", "image/webp"].includes(mimeType) || (photo?.purpose || PHOTO_PURPOSE) !== PHOTO_PURPOSE) fail("PHOTO_IDENTITY_INVALID", "Фотография не прошла локальную проверку identity.");
    return { photoId, role, displayName: nullableText(photo?.display_name || photo?.displayName, 120) || PHOTO_ROLES[role], sha256, mimeType, storage: "local_only" };
  }

  function sameBinding(left, right) {
    return canonicalize(left) === canonicalize(right);
  }

  function commit(state, event, at, details) {
    state.revision += 1;
    state.updatedAt = at;
    state.audit.push({ event, revision: state.revision, at, details: copy(details) });
    state.fingerprint = stateFingerprint(state);
    requireValidState(state);
    return freeze(state);
  }

  function artifactFingerprint(artifact) {
    const core = copy(artifact);
    delete core.fingerprint;
    return fnv1a32(core);
  }

  function stateFingerprint(state) {
    const core = copy(state);
    delete core.fingerprint;
    return fnv1a32(core);
  }

  function optionalNumber(value, { allowSigned = false, maximum }) {
    if (value === null || value === undefined || String(value).trim() === "") return null;
    const number = Number(value);
    if (!Number.isFinite(number) || (!allowSigned && number <= 0) || (allowSigned && number < -maximum) || number > maximum) fail("NUMBER_INVALID", "Числовое поле содержит недопустимое значение.");
    return number;
  }

  function optionalPositiveInteger(value, maximum) {
    if (value === null || value === undefined || String(value).trim() === "") return null;
    const number = Number(value);
    if (!Number.isSafeInteger(number) || number <= 0 || number > maximum) fail("NUMBER_INVALID", "Количество сложений нити должно быть положительным целым числом.");
    return number;
  }

  function nullableText(value, maximum) {
    if (value === null || value === undefined || String(value).trim() === "") return null;
    const text = String(value).trim();
    if (text.length > maximum) fail("TEXT_INVALID", "Текстовое поле слишком длинное.");
    return text;
  }

  function round(value, digits) {
    const factor = 10 ** digits;
    return Math.round((value + Number.EPSILON) * factor) / factor;
  }

  function timestamp(value) {
    const result = value || new Date().toISOString();
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(result) || !Number.isFinite(Date.parse(result))) fail("TIMESTAMP_INVALID", "Время изменения повреждено.");
    return result;
  }

  function requireUuid(value, code) {
    if (!globalObject.YarnAIProjectSystem?.isUuidv7?.(value)) fail(code, "Идентификатор проекта или артефакта повреждён.");
    return value;
  }

  function makeId(prefix) {
    return globalObject.YarnAIProjectSystem?.uuidv7?.() || globalObject.crypto?.randomUUID?.() || `${prefix}:${Date.now()}`;
  }

  function fnv1a32(value) {
    const source = canonicalize(value);
    let hash = 0x811c9dc5;
    for (let index = 0; index < source.length; index += 1) { hash ^= source.charCodeAt(index); hash = Math.imul(hash, 0x01000193); }
    return `fnv1a32:${(hash >>> 0).toString(16).padStart(8, "0")}`;
  }

  function canonicalize(value) {
    if (value === undefined) return "undefined";
    if (value === null || typeof value !== "object") return JSON.stringify(value);
    if (Array.isArray(value)) return `[${value.map(canonicalize).join(",")}]`;
    return `{${Object.keys(value).filter((key) => value[key] !== undefined).sort().map((key) => `${JSON.stringify(key)}:${canonicalize(value[key])}`).join(",")}}`;
  }

  function validCopy(state) { requireValidState(state); return copy(state); }
  function copy(value) { return value === undefined ? undefined : JSON.parse(JSON.stringify(value)); }
  function freeze(value) { if (value && typeof value === "object" && !Object.isFrozen(value)) { Object.freeze(value); Object.values(value).forEach(freeze); } return value; }
  function fail(code, message, details) { throw new ManualCalculationIntakeError(code, message, details); }

  const api = Object.freeze({
    CONTRACT_VERSION, SCHEMA_VERSION, PROGRESS_KIND, PHOTO_PURPOSE, ROUTE_KIND,
    MANUAL_OPTION_NAMES, INDUSTRIAL_OPTION_NAME, INDUSTRIAL_MESSAGE, PHOTO_ROLES,
    BODY_MEASUREMENTS, GARMENT_MEASUREMENTS, EASE_MEASUREMENTS, FIT_PREFERENCES, CONSTRUCTION_INPUTS, ManualCalculationIntakeError,
    classifyTechnologyHandoff, createInitialState, updateDraft, attachPhoto, reconcileState,
    appendCurrentDraft, normalizeTargetSizing, normalizeChoiceValues, normalizeYarn, normalizeNeedles, normalizeGauge, gaugeBasis,
    calculateSectionStatus, sourceBinding, profileForHandoff, yarnProfileForHandoff, bindRequirementsProfile, requireValidState, stateFingerprint, artifactFingerprint,
    ensureForProject, saveDraftForProject, addPhotoForProject, reconcileForProject,
  });
  globalObject.YarnAIManualCalculationIntake = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
