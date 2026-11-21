"use strict";

(function initializeManualIntakeValidation(globalObject) {
  const CONTRACT_VERSION = "MANUAL_INTAKE_VALIDATION_V1";
  const SCHEMA_VERSION = 1;
  const PROGRESS_KIND = "MANUAL_INTAKE_VALIDATION";
  const STATUSES = Object.freeze(["incomplete", "needs_attention", "ready_to_confirm", "confirmed", "stale", "failed"]);
  const CM_TOLERANCE = 0.1;
  const CONSTRUCTION_REQUIREMENTS = Object.freeze([]);

  class ManualIntakeValidationError extends Error {
    constructor(code, message, details = {}) {
      super(message);
      this.name = "ManualIntakeValidationError";
      this.code = code;
      this.details = details;
      this.userMessage = message;
    }
  }

  function validateSources(source, contractContext = {}, options = {}) {
    const checks = [];
    const issues = [];
    const normalizedInputs = { measurements: {}, fitPreferences: {}, constructionInputs: {}, gauge: null, needles: null, yarn: null };
    const artifact = source?.intake?.artifact || {};
    let context;
    try { context = normalizeContext(contractContext, artifact.garmentRequirementsProfile || null, artifact.yarnRequirementsProfile || null); }
    catch { context = normalizeContext({ fixtureKind: contractContext?.fixtureKind }, null, null); }
    const addCheck = (check) => checks.push(freeze(copy(check)));
    const addIssue = (issue) => {
      const normalized = normalizeIssue(issue);
      issues.push(normalized);
      return normalized;
    };

    const identityProblems = validateIdentity(source);
    addCheck({ checkId: "required:source_identity", level: "required", field: "source", title: "Проект, анализ, решение и черновик относятся к одной текущей версии", status: identityProblems.length ? "failed" : "passed", reasonCodes: identityProblems.map((entry) => entry.reasonCode), sourceReferences: sourceReferences(source) });
    identityProblems.forEach(addIssue);

    const garmentProfile = context.garmentRequirementsProfile;
    if (!garmentProfile || garmentProfile.status !== "resolved") {
      addCheck({ checkId: "required:garment_requirements", level: "required", field: "targetSizing", title: "Утверждён профиль обязательных мерок изделия", status: "unresolved", reasonCodes: ["GARMENT_REQUIREMENTS_UNRESOLVED"], sourceReferences: ["contractContext.measurementProfile"] });
      addIssue(issue("GARMENT_REQUIREMENTS_UNRESOLVED", "critical", "unresolved", "targetSizing", "Не разрешён профиль необходимых мерок", "Подтверждённая технология не содержит полного авторитетного профиля категории и конструкции.", ["intake.garmentRequirementsProfile"], garmentProfile?.firstAction || "Вернуться к подтверждённому выбору технологии.", true));
    } else {
      validateGarmentRequirements(artifact, garmentProfile, normalizedInputs, addCheck, addIssue);
    }

    validateGauge(artifact, normalizedInputs, addCheck, addIssue);
    validateNeedles(artifact, normalizedInputs, addCheck, addIssue);
    validateYarn(artifact, context, normalizedInputs, addCheck, addIssue);
    validateRecommended(artifact, addCheck, addIssue);
    validateOptional(artifact, addCheck);

    if (options.technicalFailure) {
      addIssue(issue("VALIDATION_TECHNICAL_FAILURE", "critical", "technical", "validation", "Техническая ошибка проверки", String(options.technicalFailure), ["validator"], "Повторить локальную проверку после устранения ошибки.", true));
    }

    const blockers = issues.filter((entry) => entry.blocksConfirmation);
    const conflicts = issues.filter((entry) => entry.category === "conflict");
    const unresolvedItems = issues.filter((entry) => entry.category === "unresolved" || entry.reasonCode.endsWith("_UNRESOLVED"));
    const warnings = issues.filter((entry) => entry.severity === "warning");
    const stale = issues.some((entry) => entry.reasonCode === "SOURCE_STALE" || entry.reasonCode === "SOURCE_IDENTITY_MISMATCH");
    const failed = issues.some((entry) => entry.reasonCode === "VALIDATION_TECHNICAL_FAILURE" || entry.category === "integrity");
    const missingOrInvalid = blockers.some((entry) => ["missing", "invalid"].includes(entry.category));
    let status = "ready_to_confirm";
    if (failed) status = "failed";
    else if (stale) status = "stale";
    else if (missingOrInvalid) status = "incomplete";
    else if (blockers.length) status = "needs_attention";
    const readyForConfirmation = status === "ready_to_confirm" && blockers.length === 0;
    const firstAction = blockers[0] || warnings[0] || null;
    const result = {
      contractVersion: CONTRACT_VERSION,
      schemaVersion: SCHEMA_VERSION,
      status,
      readyForConfirmation,
      abstain: !readyForConfirmation,
      inputFingerprint: inputFingerprint(source, context),
      contextFingerprint: fnv1a32(context),
      checks,
      completedChecks: checks.filter((entry) => entry.status === "passed"),
      blockers,
      conflicts,
      unresolvedItems,
      warnings,
      firstAction,
      normalizedInputs,
    };
    result.semanticFingerprint = semanticFingerprint(result);
    return freeze(result);
  }

  function validateIdentity(source) {
    const result = [];
    const projectId = source?.project?.id;
    const analysis = source?.analysis || {};
    const decision = source?.decision || {};
    const intake = source?.intake || {};
    const binding = intake.artifact?.source || {};
    const refs = sourceReferences(source);
    const integrityBad = !projectId || !Number.isSafeInteger(source?.project?.repositoryRevision) || source.project.repositoryRevision < 1
      || !analysis.id || !Number.isSafeInteger(analysis.revision) || analysis.revision < 1 || !analysis.fingerprint || !analysis.requestId || !analysis.requestFingerprint
      || !decision.id || !Number.isSafeInteger(decision.revision) || decision.revision < 1 || !decision.fingerprint
      || !intake.id || !Number.isSafeInteger(intake.revision) || intake.revision < 1 || !intake.fingerprint;
    if (integrityBad) result.push(issue("SOURCE_INTEGRITY_INVALID", "critical", "integrity", "source", "Источник проверки повреждён", "Не хватает identity или fingerprint одного из обязательных артефактов.", refs, "Вернуться к сохранённому проекту и восстановить текущую цепочку источников.", true));
    const ownershipBad = [analysis.projectId, decision.projectId, intake.projectId, binding.projectId].some((value) => value !== projectId);
    if (ownershipBad || binding.analysisId !== analysis.id || binding.analysisRequestId !== analysis.requestId || binding.sourceAnalysisFingerprint !== analysis.fingerprint || binding.sourceRequestFingerprint !== analysis.requestFingerprint || binding.technologyDecisionId !== decision.id || binding.technologyDecisionRevision !== decision.revision || binding.selectedOptionId !== decision.selectedOptionId) {
      result.push(issue("SOURCE_IDENTITY_MISMATCH", "critical", "stale", "source", "Источники относятся к разным версиям", "Черновик не совпадает с текущим анализом или подтверждённым решением технологии.", refs, "Открыть текущий проект заново и создать черновик для актуального решения.", true));
    }
    if (analysis.current !== true || decision.current !== true || decision.status !== "confirmed" || intake.status !== "draft") result.push(issue("SOURCE_STALE", "critical", "stale", "source", "Источник больше не является текущим", "Подтверждать можно только текущий анализ, текущее подтверждённое решение и активный черновик.", refs, "Вернуться к актуальной версии источника.", true));
    if (decision.route !== "manual") result.push(issue("INDUSTRIAL_ROUTE_UNSUPPORTED", "critical", "invalid", "source.decision", "Маршрут не относится к ручному вязанию", "Этот контракт предназначен только для двух подтверждённых ручных способов.", refs, "Выбрать и отдельно подтвердить ручной способ.", true));
    const profile = intake.artifact?.garmentRequirementsProfile;
    if (profile) {
      try {
        const expected = requireRequirementsDomain().compactBinding(profile);
        if (canonicalize(binding.garmentRequirements) !== canonicalize(expected)
          || expected.analysisId !== analysis.id || expected.analysisRevision !== analysis.revision || expected.analysisFingerprint !== analysis.fingerprint
          || expected.technologyDecisionId !== decision.id || expected.technologyDecisionRevision !== decision.revision || expected.technologyDecisionFingerprint !== decision.fingerprint) {
          result.push(issue("SOURCE_IDENTITY_MISMATCH", "critical", "stale", "garmentRequirements", "Профиль мерок относится к другой версии технологии", "Contract version, fingerprint или upstream binding профиля не совпадает с текущим решением.", refs, "Открыть актуальный проект и повторно проверить данные.", true));
        }
      } catch {
        result.push(issue("SOURCE_IDENTITY_MISMATCH", "critical", "stale", "garmentRequirements", "Профиль мерок повреждён", "Canonical profile fingerprint или contract version не прошли проверку.", refs, "Открыть актуальный проект и повторно сформировать профиль.", true));
      }
    }
    const yarnProfile = intake.artifact?.yarnRequirementsProfile;
    if (yarnProfile) {
      try {
        const expected = requireYarnRequirementsDomain().compactBinding(yarnProfile);
        if (canonicalize(binding.yarnRequirements) !== canonicalize(expected)
          || expected.analysisId !== analysis.id || expected.analysisRevision !== analysis.revision || expected.analysisFingerprint !== analysis.fingerprint
          || expected.technologyDecisionId !== decision.id || expected.technologyDecisionRevision !== decision.revision || expected.technologyDecisionFingerprint !== decision.fingerprint) {
          result.push(issue("SOURCE_IDENTITY_MISMATCH", "critical", "stale", "yarnRequirements", "Профиль пряжи относится к другой версии технологии", "Contract version, fingerprint или upstream binding профиля не совпадает с текущим решением.", refs, "Открыть актуальный проект и повторно проверить данные.", true));
        }
      } catch {
        result.push(issue("SOURCE_IDENTITY_MISMATCH", "critical", "stale", "yarnRequirements", "Профиль требований к пряже повреждён", "Canonical profile fingerprint или contract version не прошли проверку.", refs, "Открыть актуальный проект и повторно сформировать профиль.", true));
      }
    }
    return result;
  }

  function validateGarmentRequirements(artifact, profile, normalizedInputs, addCheck, addIssue) {
    const domain = requireRequirementsDomain();
    try { domain.requireValidProfile(profile); }
    catch {
      addCheck({ checkId: "required:garment_requirements", level: "required", field: "targetSizing", title: "Авторитетный профиль необходимых мерок", status: "unresolved", reasonCodes: ["GARMENT_REQUIREMENTS_UNRESOLVED"], sourceReferences: ["intake.garmentRequirementsProfile"] });
      addIssue(issue("GARMENT_REQUIREMENTS_UNRESOLVED", "critical", "unresolved", "targetSizing", "Профиль необходимых мерок повреждён", "Contract version или canonical fingerprint не прошли проверку.", ["intake.garmentRequirementsProfile"], "Вернуться к подтверждённой технологии и открыть текущий черновик заново.", true));
      return;
    }
    addCheck({ checkId: "required:garment_requirements", level: "required", field: "targetSizing", title: "Авторитетный профиль необходимых мерок", status: "passed", reasonCodes: [], sourceReferences: ["intake.garmentRequirementsProfile"], normalizedValue: { contractVersion: profile.contractVersion, profileFingerprint: profile.canonicalFingerprint, constructionIdentity: profile.constructionIdentity, garmentCategory: profile.garmentCategory } });
    const evaluated = domain.evaluateProfile(profile, artifact);
    profile.measurementRequirements.forEach((requirement) => {
      const item = evaluated.items.find((entry) => entry.measurementId === requirement.measurementId);
      const refs = [requirement.valuePath ? `intake.${requirement.valuePath}` : "intake.garmentRequirementsProfile"];
      const checkStatus = item.status === "filled" ? "passed" : item.status === "inactive" ? "not_applicable" : item.status;
      addCheck({
        checkId: `${requirement.requirementLevel}:garment:${requirement.measurementId}`,
        level: requirement.requirementLevel,
        field: requirement.measurementId,
        title: requirement.labelRu,
        status: checkStatus,
        reasonCodes: item.blocks ? [item.status === "invalid" ? "INVALID_NUMERIC_VALUE" : "REQUIRED_VALUE_MISSING"] : [],
        sourceReferences: refs,
        normalizedValue: item.normalizedValue,
      });
      if (item.status === "filled") {
        const bucket = requirement.inputType === "FIT_PREFERENCE" ? normalizedInputs.fitPreferences
          : requirement.inputType === "CONSTRUCTION_INPUT" ? normalizedInputs.constructionInputs
          : normalizedInputs.measurements;
        bucket[requirement.measurementId] = requirement.inputType === "BODY_MEASUREMENT" || requirement.inputType === "FINISHED_GARMENT_MEASUREMENT"
          ? { valueCm: item.normalizedValue.value, source: requirement.inputType === "BODY_MEASUREMENT" ? "body_measurement" : "finished_garment", inputType: requirement.inputType }
          : { value: copy(item.normalizedValue), inputType: requirement.inputType, source: requirement.allowedSources[0] };
      }
      if (item.blocks) {
        const invalid = item.status === "invalid";
        addIssue(issue(
          invalid ? "INVALID_NUMERIC_VALUE" : "REQUIRED_VALUE_MISSING",
          "critical",
          invalid ? "invalid" : "missing",
          requirement.measurementId,
          `${invalid ? "Неверное значение" : "Не заполнено"}: ${requirement.labelRu}`,
          `${requirement.explanationRu} ${requirement.reasonRu}`,
          refs,
          item.suggestedAction,
          true,
        ));
      }
    });
    const finishedBust = measurementValue(artifact?.targetSizing?.finishedGarmentMeasurements, "finished_bust_circumference");
    const bodyBust = measurementValue(artifact?.targetSizing?.bodyMeasurements, "bust_circumference");
    const bustEase = measurementValue(artifact?.targetSizing?.ease, "bust_ease");
    if (finishedBust !== null) {
      normalizedInputs.measurements.finished_bust_circumference = { valueCm: finishedBust, source: "finished_garment", inputType: "FINISHED_GARMENT_MEASUREMENT" };
    } else if (bodyBust !== null && bustEase !== null) {
      normalizedInputs.measurements.finished_bust_circumference = { valueCm: round(bodyBust + bustEase, 4), source: "body_plus_ease", bodyCm: bodyBust, easeCm: bustEase, inputType: "FINISHED_GARMENT_MEASUREMENT" };
    }
    validateBustAlternativeConflict(artifact, addCheck, addIssue);
  }

  function validateBustAlternativeConflict(artifact, addCheck, addIssue) {
    const finished = measurementValue(artifact?.targetSizing?.finishedGarmentMeasurements, "finished_bust_circumference");
    const body = measurementValue(artifact?.targetSizing?.bodyMeasurements, "bust_circumference");
    const ease = measurementValue(artifact?.targetSizing?.ease, "bust_ease");
    if (finished === null || body === null || ease === null) return;
    const derived = round(body + ease, 4);
    if (Math.abs(finished - derived) <= CM_TOLERANCE) return;
    const refs = ["intake.targetSizing.finishedGarmentMeasurements.finished_bust_circumference", "intake.targetSizing.bodyMeasurements.bust_circumference", "intake.targetSizing.ease.bust_ease"];
    addCheck({ checkId: "required:garment:bust_target_consistency", level: "required", field: "finished_bust_circumference", title: "Обхват изделия согласован с меркой человека и посадкой", status: "conflict", reasonCodes: ["MEASUREMENT_CONFLICT"], sourceReferences: refs });
    addIssue(issue("MEASUREMENT_CONFLICT", "critical", "conflict", "finished_bust_circumference", "Конфликт обхвата изделия по груди", `Готовый обхват ${finished} см не совпадает с меркой человека плюс свободой облегания ${derived} см. Допуск ${CM_TOLERANCE} см.`, refs, "Исправить прямой обхват изделия либо пару «мерка человека + свобода облегания».", true));
  }

  function validateMeasurementRequirement(artifact, requirement, normalized, addCheck, addIssue) {
    const finished = measurementValue(artifact?.targetSizing?.finishedGarmentMeasurements, requirement.field);
    const body = requirement.bodyField ? measurementValue(artifact?.targetSizing?.bodyMeasurements, requirement.bodyField) : null;
    const ease = requirement.easeField ? measurementValue(artifact?.targetSizing?.ease, requirement.easeField) : null;
    const derived = body !== null && ease !== null ? round(body + ease, 4) : null;
    const refs = [`intake.targetSizing.${requirement.field}`];
    if (finished !== null && derived !== null && Math.abs(finished - derived) > CM_TOLERANCE) {
      addCheck({ checkId: `required:measurement:${requirement.field}`, level: "required", field: requirement.field, title: requirement.label, status: "conflict", reasonCodes: ["MEASUREMENT_CONFLICT"], sourceReferences: refs });
      addIssue(issue("MEASUREMENT_CONFLICT", "critical", "conflict", requirement.field, `Конфликт: ${requirement.label}`, `Готовая мерка ${finished} см не совпадает с телом плюс свобода облегания ${derived} см. Допуск ${CM_TOLERANCE} см.`, refs, "Исправить одно из значений или явно согласовать источник.", true));
      return;
    }
    const value = finished ?? derived;
    if (value === null || value <= 0) {
      addCheck({ checkId: `required:measurement:${requirement.field}`, level: "required", field: requirement.field, title: requirement.label, status: "missing", reasonCodes: ["REQUIRED_VALUE_MISSING"], sourceReferences: refs });
      addIssue(issue("REQUIRED_VALUE_MISSING", "critical", "missing", requirement.field, `Не заполнено: ${requirement.label}`, "Нужна готовая мерка либо разрешённая пара «мерка тела + свобода облегания».", refs, "Заполнить мерку в сантиметрах.", true));
      return;
    }
    normalized[requirement.field] = { valueCm: value, source: finished !== null ? "finished_garment" : "body_plus_ease", bodyCm: body, easeCm: ease };
    addCheck({ checkId: `required:measurement:${requirement.field}`, level: "required", field: requirement.field, title: requirement.label, status: "passed", reasonCodes: [], sourceReferences: refs, normalizedValue: normalized[requirement.field] });
  }

  function validateGauge(artifact, normalizedInputs, addCheck, addIssue) {
    const gauge = artifact?.gauge?.sourceMeasurement || {};
    const refs = ["intake.gauge.sourceMeasurement"];
    const fields = [
      ["stitches", "число петель", true], ["widthCm", "ширина образца", false],
      ["rows", "число рядов", true], ["heightCm", "высота образца", false],
    ];
    let valid = true;
    const reasonCodes = [];
    fields.forEach(([field, label, integer]) => {
      const value = gauge[field];
      if (value === null || value === undefined) {
        valid = false;
        reasonCodes.push("GAUGE_MISSING");
        addIssue(issue("GAUGE_MISSING", "critical", "missing", `gauge.${field}`, `Не заполнено: ${label}`, "Для плотности нужны петли, ряды и размеры образца в сантиметрах.", refs, "Заполнить поле плотности.", true));
      } else if (!Number.isFinite(value) || value <= 0 || (integer && !Number.isInteger(value))) {
        valid = false;
        reasonCodes.push("INVALID_NUMERIC_VALUE");
        addIssue(issue("INVALID_NUMERIC_VALUE", "critical", "invalid", `gauge.${field}`, `Недопустимое значение: ${label}`, integer ? "Число должно быть положительным целым." : "Число должно быть положительным.", refs, "Исправить значение.", true));
      }
    });
    if (gauge.afterTreatment !== "yes") {
      valid = false;
      reasonCodes.push("GAUGE_NOT_PROCESSED");
      addIssue(issue("GAUGE_NOT_PROCESSED", "critical", "invalid", "gauge.afterTreatment", "Образец не подтверждён после обработки", "Плотность должна быть измерена после стирки и сушки тем способом, который будет применён к изделию.", refs, "Обработать образец и выбрать «Да».", true));
    }
    if (valid) normalizedInputs.gauge = { stitchesPer10Cm: round(gauge.stitches * 10 / gauge.widthCm, 4), rowsPer10Cm: round(gauge.rows * 10 / gauge.heightCm, 4), unit: "10_cm", sourceUnit: "cm" };
    addCheck({ checkId: "required:gauge", level: "required", field: "gauge", title: "Контрольный образец плотности", status: valid ? "passed" : "failed", reasonCodes: unique(reasonCodes), sourceReferences: refs, normalizedValue: normalizedInputs.gauge });
  }

  function validateNeedles(artifact, normalizedInputs, addCheck, addIssue) {
    const primary = artifact?.needles?.primaryMm;
    const gaugeNeedle = artifact?.gauge?.sourceMeasurement?.needleSizeMm;
    const refs = ["intake.needles.primaryMm", "intake.gauge.sourceMeasurement.needleSizeMm"];
    let valid = true;
    const reasonCodes = [];
    if (!Number.isFinite(primary) || primary <= 0) { valid = false; reasonCodes.push("NEEDLE_MISSING"); addIssue(issue("NEEDLE_MISSING", "critical", "missing", "needles.primaryMm", "Не выбран основной размер спиц", "Нужен положительный размер основных спиц в миллиметрах.", refs, "Выбрать основные спицы.", true)); }
    if (!Number.isFinite(gaugeNeedle) || gaugeNeedle <= 0) { valid = false; reasonCodes.push("GAUGE_NEEDLE_MISSING"); addIssue(issue("GAUGE_NEEDLE_MISSING", "critical", "missing", "gauge.needleSizeMm", "Не указан размер спиц образца", "Плотность без размера спиц нельзя связать с выбранным инструментом.", refs, "Указать размер спиц образца.", true)); }
    if (Number.isFinite(primary) && Number.isFinite(gaugeNeedle) && Math.abs(primary - gaugeNeedle) > CM_TOLERANCE) {
      valid = false;
      reasonCodes.push("GAUGE_NEEDLE_CONFLICT");
      addIssue(issue("GAUGE_NEEDLE_CONFLICT", "critical", "conflict", "needles.primaryMm", "Основные спицы не совпадают со спицами образца", `Основные спицы: ${primary} мм; образец: ${gaugeNeedle} мм.`, refs, "Выбрать совпадающий размер или связать новый образец.", true));
    }
    if (valid) normalizedInputs.needles = { primaryMm: primary, gaugeNeedleMm: gaugeNeedle, additionalMm: copy(artifact.needles.additionalMm || []) };
    addCheck({ checkId: "required:needles", level: "required", field: "needles", title: "Основные спицы и спицы образца согласованы", status: valid ? "passed" : "failed", reasonCodes: unique(reasonCodes), sourceReferences: refs, normalizedValue: normalizedInputs.needles });
  }

  function validateYarn(artifact, context, normalizedInputs, addCheck, addIssue) {
    const yarn = artifact?.yarn || {};
    const profile = context.yarnRequirementsProfile;
    const refs = ["intake.yarn", "intake.yarnRequirementsProfile"];
    let valid = true;
    const reasonCodes = [];
    if (!profile || profile.status !== "resolved") {
      valid = false;
      reasonCodes.push("YARN_REQUIREMENTS_UNRESOLVED");
      addIssue(issue("YARN_REQUIREMENTS_UNRESOLVED", "critical", "unresolved", "yarn", "Не разрешён профиль требований к пряже", "Валидатор не получил целостный профиль, связанный с exact подтверждённой технологией.", refs, profile?.firstAction || "Открыть текущий проект заново.", true));
    }
    if (yarn.selectionStatus !== "selected" || !yarn.name) {
      valid = false;
      reasonCodes.push("YARN_NOT_SELECTED");
      addIssue(issue("YARN_NOT_SELECTED", "critical", "missing", "yarn.name", "Не выбрана конкретная пряжа", "Для подтверждения нужна конкретная пряжа, а не только намерение выбрать её позже.", refs, "Выбрать пряжу и указать название.", true));
    } else if (profile?.status === "resolved") {
      const evaluated = requireYarnRequirementsDomain().evaluateProfile(profile, artifact);
      evaluated.blockers.forEach((blocker) => {
        valid = false;
        const requirement = profile.requirements.find((entry) => entry.requirementId === blocker.requirementId);
        const reasonCode = blocker.status === "invalid" ? "YARN_REQUIRED_FIELD_INVALID" : "YARN_REQUIRED_FIELD_MISSING";
        reasonCodes.push(reasonCode);
        addIssue(issue(reasonCode, "critical", blocker.status === "invalid" ? "invalid" : "missing", requirement.valuePath, `Не заполнено обязательное свойство пряжи: ${requirement.labelRu}`, requirement.reasonRu, refs, blocker.suggestedAction, true));
      });
    }
    if (valid) normalizedInputs.yarn = { ...copy(yarn), strands: yarn.strandCount, strandsDescription: `strands=${yarn.strandCount}; derived_from=yarn.strandCount` };
    addCheck({ checkId: "required:yarn", level: "required", field: "yarn", title: "Конкретная пряжа соответствует утверждённому минимуму", status: valid ? "passed" : "failed", reasonCodes: unique(reasonCodes), sourceReferences: refs, normalizedValue: normalizedInputs.yarn });
  }

  function validateConstruction(context, normalizedInputs, addCheck, addIssue) {
    CONSTRUCTION_REQUIREMENTS.forEach((requirement) => {
      const decision = context.constructionDecisions[requirement.id];
      const valid = decision?.status === "confirmed" && typeof decision.value === "string" && decision.value.trim();
      if (!valid) addIssue(issue("CONSTRUCTION_DECISION_UNRESOLVED", "critical", "unresolved", `construction.${requirement.id}`, `Не подтверждено: ${requirement.label}`, "Фотография не доказывает скрытую конструкцию; решение должен подтвердить пользователь или иной явный источник.", [`contractContext.constructionDecisions.${requirement.id}`], "Подтвердить конструктивное решение отдельным пользовательским действием.", true));
      else normalizedInputs.constructionDecisions[requirement.id] = copy(decision);
      addCheck({ checkId: `required:construction:${requirement.id}`, level: "required", field: `construction.${requirement.id}`, title: requirement.label, status: valid ? "passed" : "unresolved", reasonCodes: valid ? [] : ["CONSTRUCTION_DECISION_UNRESOLVED"], sourceReferences: [`contractContext.constructionDecisions.${requirement.id}`] });
    });
  }

  function validateRecommended(artifact, addCheck, addIssue) {
    const photos = artifact?.additionalPhotos || [];
    const roles = new Set(photos.map((entry) => entry.role));
    [["back", "вид сзади"], ["side", "вид сбоку"], ["detail", "фото важных деталей"], ["yarn_label", "фото этикетки пряжи"], ["swatch", "фото контрольного образца"]].forEach(([role, label]) => {
      const present = roles.has(role);
      addCheck({ checkId: `recommended:photo:${role}`, level: "recommended", field: `additionalPhotos.${role}`, title: label, status: present ? "passed" : "missing", reasonCodes: present ? [] : ["RECOMMENDED_EVIDENCE_MISSING"], sourceReferences: ["intake.additionalPhotos"] });
      if (!present) addIssue(issue("RECOMMENDED_EVIDENCE_MISSING", "warning", "recommended", `additionalPhotos.${role}`, `Рекомендуется: ${label}`, "Это улучшит последующую проверяемость, но само по себе не блокирует подтверждение.", ["intake.additionalPhotos"], `Добавить ${label}, если оно доступно.`, false));
    });
  }

  function validateOptional(artifact, addCheck) {
    addCheck({ checkId: "optional:notes", level: "optional", field: "notes", title: "Дополнительные заметки", status: artifact?.notes ? "passed" : "optional", reasonCodes: [], sourceReferences: ["intake.notes"] });
    addCheck({ checkId: "optional:additional_needles", level: "optional", field: "needles.additionalMm", title: "Дополнительные спицы", status: artifact?.needles?.additionalMm?.length ? "passed" : "optional", reasonCodes: [], sourceReferences: ["intake.needles.additionalMm"] });
  }

  async function validateForProject(repository, projectId, options = {}) {
    const intakeDomain = requireIntakeDomain();
    const inspected = await intakeDomain.ensureForProject(repository, projectId);
    const source = sourceFromInspected(inspected);
    const context = options.contractContext === undefined ? {} : options.contractContext;
    const result = validateSources(source, context, options);
    const existing = findProgress(inspected.aggregate, inspected.calculation.calculation_id);
    if (existing) {
      requireValidState(existing.state);
      if (existing.state.status === "confirmed" && existing.state.inputFingerprint === result.inputFingerprint) return inspectedValidation(inspected.aggregate, inspected.calculation.calculation_id);
      if (existing.state.semanticFingerprint === result.semanticFingerprint && existing.state.inputFingerprint === result.inputFingerprint && existing.state.status === result.status) return inspectedValidation(inspected.aggregate, inspected.calculation.calculation_id);
    }
    const now = timestamp(options.now);
    const state = existing ? copy(existing.state) : initialState(projectId, inspected.calculation.calculation_id, now);
    if (state.confirmedSnapshot) {
      state.history.push({ status: "stale", reason: "source_or_validation_changed", at: now, snapshot: state.confirmedSnapshot });
      state.confirmedSnapshot = null;
      state.confirmedSnapshotFingerprint = null;
    }
    applyResult(state, result, context, source, now);
    state.revision += existing ? 1 : 0;
    state.updatedAt = now;
    state.audit.push({ event: existing ? "manual_intake_revalidated" : "manual_intake_validated", revision: state.revision, at: now, details: { status: state.status, inputFingerprint: state.inputFingerprint } });
    state.fingerprint = stateFingerprint(state);
    requireValidState(state);
    if (!existing) await repository.ensureCalculationProgress(projectId, inspected.calculation.calculation_id, PROGRESS_KIND, state, { projectStage: "manual_intake_validation", operationKind: "MANUAL_INTAKE_VALIDATED" });
    else await repository.updateCalculationProgress(projectId, inspected.calculation.calculation_id, PROGRESS_KIND, state, { baseProgressRevision: existing.revision, projectStage: "manual_intake_validation", operationKind: "MANUAL_INTAKE_REVALIDATED" });
    return inspectedValidation(await repository.getProject(projectId), inspected.calculation.calculation_id);
  }

  async function inspectForProject(repository, projectId) {
    const aggregate = await repository.getProject(projectId);
    const calculation = activeCalculation(aggregate);
    if (!calculation) return null;
    const progress = findProgress(aggregate, calculation.calculation_id);
    if (!progress) return null;
    return inspectedValidation(aggregate, calculation.calculation_id);
  }

  async function reconcileForProject(repository, projectId, options = {}) {
    const aggregate = await repository.getProject(projectId);
    const calculation = activeCalculation(aggregate);
    if (!calculation) return null;
    const progress = findProgress(aggregate, calculation.calculation_id);
    if (!progress) return null;
    requireValidState(progress.state);
    let inspectedIntake;
    try { inspectedIntake = await requireIntakeDomain().ensureForProject(repository, projectId); } catch { inspectedIntake = null; }
    if (!inspectedIntake) return markStale(repository, aggregate, calculation, progress, "source_unavailable", options.now);
    const current = validateSources(sourceFromInspected(inspectedIntake), progress.state.contractContextSnapshot || {});
    if (current.inputFingerprint === progress.state.inputFingerprint) return inspectedValidation(inspectedIntake.aggregate, calculation.calculation_id);
    return markStale(repository, inspectedIntake.aggregate, calculation, findProgress(inspectedIntake.aggregate, calculation.calculation_id), "source_changed", options.now);
  }

  async function confirmForProject(repository, projectId, options = {}) {
    const inspected = await reconcileForProject(repository, projectId, options);
    if (!inspected) fail("VALIDATION_NOT_FOUND", "Сначала выполни проверку данных.");
    const progress = inspected.progress;
    const state = copy(inspected.state);
    if (state.status === "confirmed") return inspected;
    if (state.status !== "ready_to_confirm" || state.readyForConfirmation !== true || state.blockers.length) fail("CONFIRMATION_BLOCKED", state.firstAction?.explanation || "Обязательные проверки ещё не пройдены.", { status: state.status, firstAction: state.firstAction });
    const now = timestamp(options.now);
    const snapshot = {
      snapshotId: makeId("manual-validation-snapshot"),
      contractVersion: CONTRACT_VERSION,
      projectId: state.projectId,
      calculationId: state.calculationId,
      validationId: state.validationId,
      validationRevision: state.revision,
      validatedProjectRevision: state.validatedProjectRevision,
      sourceSnapshot: copy(state.sourceSnapshot),
      inputFingerprint: state.inputFingerprint,
      semanticFingerprint: state.semanticFingerprint,
      contractContextSnapshot: copy(state.contractContextSnapshot),
      normalizedInputs: copy(state.normalizedInputs),
      confirmedAt: now,
      fingerprint: "",
    };
    snapshot.fingerprint = snapshotFingerprint(snapshot);
    state.status = "confirmed";
    state.readyForConfirmation = false;
    state.abstain = false;
    state.confirmedSnapshot = snapshot;
    state.confirmedSnapshotFingerprint = snapshot.fingerprint;
    state.revision += 1;
    state.updatedAt = now;
    state.audit.push({ event: "manual_intake_validation_confirmed", revision: state.revision, at: now, details: { snapshotFingerprint: snapshot.fingerprint } });
    state.fingerprint = stateFingerprint(state);
    requireValidState(state);
    await repository.updateCalculationProgress(projectId, state.calculationId, PROGRESS_KIND, state, { baseProgressRevision: progress.revision, projectStage: "manual_intake_validation_confirmed", operationKind: "MANUAL_INTAKE_VALIDATION_CONFIRMED" });
    return inspectedValidation(await repository.getProject(projectId), state.calculationId);
  }

  async function reopenForProject(repository, projectId, options = {}) {
    const inspected = await inspectForProject(repository, projectId);
    if (!inspected || inspected.state.status !== "confirmed") return inspected;
    const state = copy(inspected.state);
    const now = timestamp(options.now);
    state.history.push({ status: "stale", reason: "explicit_reopen", at: now, snapshot: state.confirmedSnapshot });
    state.confirmedSnapshot = null;
    state.confirmedSnapshotFingerprint = null;
    state.status = "stale";
    state.readyForConfirmation = false;
    state.abstain = true;
    state.revision += 1;
    state.updatedAt = now;
    state.audit.push({ event: "manual_intake_validation_reopened", revision: state.revision, at: now, details: {} });
    state.fingerprint = stateFingerprint(state);
    requireValidState(state);
    await repository.updateCalculationProgress(projectId, state.calculationId, PROGRESS_KIND, state, { baseProgressRevision: inspected.progress.revision, projectStage: "manual_intake_validation_stale", operationKind: "MANUAL_INTAKE_VALIDATION_REOPENED" });
    return inspectedValidation(await repository.getProject(projectId), state.calculationId);
  }

  async function markStale(repository, aggregate, calculation, progress, reason, nowValue) {
    if (progress.state.status === "stale") return inspectedValidation(aggregate, calculation.calculation_id);
    const state = copy(progress.state);
    const now = timestamp(nowValue);
    if (state.confirmedSnapshot) state.history.push({ status: "stale", reason, at: now, snapshot: state.confirmedSnapshot });
    state.confirmedSnapshot = null;
    state.confirmedSnapshotFingerprint = null;
    state.status = "stale";
    state.readyForConfirmation = false;
    state.abstain = true;
    state.revision += 1;
    state.updatedAt = now;
    state.audit.push({ event: "manual_intake_validation_stale", revision: state.revision, at: now, details: { reason } });
    state.fingerprint = stateFingerprint(state);
    requireValidState(state);
    await repository.updateCalculationProgress(state.projectId, state.calculationId, PROGRESS_KIND, state, { baseProgressRevision: progress.revision, projectStage: "manual_intake_validation_stale", operationKind: "MANUAL_INTAKE_VALIDATION_STALE" });
    return inspectedValidation(await repository.getProject(state.projectId), state.calculationId);
  }

  function sourceFromInspected(inspected) {
    const garmentDomain = globalObject.YarnAIGarmentReferenceAnalysis;
    const intakeDomain = requireIntakeDomain();
    const garmentProgress = inspected.aggregate.progress.find((entry) => entry.kind === garmentDomain?.PROGRESS_KIND && entry.calculation_id === inspected.calculation.calculation_id && entry.epoch === 1);
    if (!garmentProgress) fail("GARMENT_ANALYSIS_NOT_FOUND", "Исходный анализ изделия не найден.");
    const handoff = garmentDomain.technologyDecisionHandoff(garmentProgress.state);
    const route = intakeDomain.classifyTechnologyHandoff(handoff);
    return freeze({
      project: { id: inspected.project.project_id, repositoryRevision: inspected.project.revision },
      analysis: { id: handoff.analysisId, revision: handoff.analysisRevision, fingerprint: handoff.sourceAnalysisFingerprint, requestId: handoff.analysisRequestId, requestFingerprint: handoff.sourceRequestFingerprint, projectId: handoff.projectId, current: handoff.isCurrent === true },
      decision: { id: handoff.technologyDecisionId, revision: handoff.technologyDecisionRevision, fingerprint: handoff.technologyDecisionFingerprint, selectedOptionId: handoff.selectedOptionId, selectedOptionName: handoff.selectedOption?.name || null, projectId: handoff.projectId, status: handoff.decisionStatus, current: handoff.isCurrent === true, route },
      intake: { id: inspected.artifact.intakeId, revision: inspected.artifact.revision, fingerprint: inspected.artifact.fingerprint, projectId: inspected.artifact.source.projectId, status: inspected.artifact.status, artifact: copy(inspected.artifact) },
    });
  }

  function initialState(projectId, calculationId, now) {
    return { contractVersion: CONTRACT_VERSION, schemaVersion: SCHEMA_VERSION, kind: PROGRESS_KIND, validationId: makeId("manual-validation"), projectId, calculationId, revision: 1, status: "incomplete", readyForConfirmation: false, abstain: true, validatedProjectRevision: null, sourceSnapshot: null, inputFingerprint: null, contextFingerprint: null, semanticFingerprint: null, checks: [], completedChecks: [], blockers: [], conflicts: [], unresolvedItems: [], warnings: [], firstAction: null, normalizedInputs: {}, contractContextSnapshot: {}, confirmedSnapshot: null, confirmedSnapshotFingerprint: null, history: [], audit: [], createdAt: now, updatedAt: now, fingerprint: "" };
  }

  function applyResult(state, result, context, source, now) {
    state.status = result.status;
    state.readyForConfirmation = result.readyForConfirmation;
    state.abstain = result.abstain;
    state.validatedProjectRevision = source.project.repositoryRevision;
    state.sourceSnapshot = {
      project: copy(source.project), analysis: copy(source.analysis), decision: copy(source.decision),
      intake: { id: source.intake.id, revision: source.intake.revision, fingerprint: source.intake.fingerprint, projectId: source.intake.projectId, status: source.intake.status },
    };
    ["inputFingerprint", "contextFingerprint", "semanticFingerprint", "checks", "completedChecks", "blockers", "conflicts", "unresolvedItems", "warnings", "firstAction", "normalizedInputs"].forEach((field) => { state[field] = copy(result[field]); });
    state.contractContextSnapshot = normalizeContext(context, source.intake.artifact?.garmentRequirementsProfile || null, source.intake.artifact?.yarnRequirementsProfile || null);
    state.validatedAt = now;
  }

  function normalizeContext(value, sourceProfile = null, sourceYarnProfile = null) {
    const source = value && typeof value === "object" && !Array.isArray(value) ? value : {};
    const profile = sourceProfile || source.garmentRequirementsProfile || null;
    let garmentRequirementsProfile = null;
    if (profile) {
      requireRequirementsDomain().requireValidProfile(profile);
      garmentRequirementsProfile = copy(profile);
    }
    const yarnProfile = sourceYarnProfile || source.yarnRequirementsProfile || null;
    let yarnRequirementsProfile = null;
    if (yarnProfile) {
      requireYarnRequirementsDomain().requireValidProfile(yarnProfile);
      yarnRequirementsProfile = copy(yarnProfile);
    }
    return freeze({ fixtureKind: source.fixtureKind ? String(source.fixtureKind) : null, garmentRequirementsProfile, yarnRequirementsProfile });
  }

  function syntheticFixtureContext() {
    return freeze({
      fixtureKind: "TEST_ONLY_SYNTHETIC_SUFFICIENT_INPUT_V1",
    });
  }

  function requireValidState(value) {
    if (!value || value.contractVersion !== CONTRACT_VERSION || value.schemaVersion !== SCHEMA_VERSION || value.kind !== PROGRESS_KIND || !STATUSES.includes(value.status)) fail("VALIDATION_STATE_INVALID", "Состояние проверки имеет неверную версию или status.");
    if (!value.projectId || !value.calculationId || !value.validationId || !Number.isSafeInteger(value.revision) || value.revision < 1 || !Array.isArray(value.checks) || !Array.isArray(value.blockers) || !Array.isArray(value.history) || !Array.isArray(value.audit)) fail("VALIDATION_STATE_INVALID", "Состояние проверки повреждено.");
    if (value.readyForConfirmation !== (value.status === "ready_to_confirm")) fail("VALIDATION_STATE_INVALID", "Флаг готовности не совпадает со status.");
    if (value.status === "confirmed") {
      if (!value.confirmedSnapshot || snapshotFingerprint(value.confirmedSnapshot) !== value.confirmedSnapshotFingerprint) fail("CONFIRMED_SNAPSHOT_INVALID", "Подтверждённый snapshot повреждён.");
    } else if (value.confirmedSnapshot !== null || value.confirmedSnapshotFingerprint !== null) fail("VALIDATION_STATE_INVALID", "Активный snapshot разрешён только для confirmed.");
    if (stateFingerprint(value) !== value.fingerprint) fail("VALIDATION_STATE_FINGERPRINT_MISMATCH", "Состояние проверки не прошло проверку целостности.");
    return true;
  }

  function inspectedValidation(aggregate, calculationId) {
    const progress = findProgress(aggregate, calculationId);
    if (!progress) fail("VALIDATION_NOT_FOUND", "Проверка данных не найдена.");
    requireValidState(progress.state);
    return { aggregate, project: aggregate.project, calculation: aggregate.calculations.find((entry) => entry.calculation_id === calculationId), progress, state: freeze(copy(progress.state)) };
  }

  function findProgress(aggregate, calculationId) { return aggregate.progress.find((entry) => entry.kind === PROGRESS_KIND && entry.calculation_id === calculationId && entry.epoch === 1) || null; }
  function activeCalculation(aggregate) { return aggregate.calculations.find((entry) => entry.calculation_id === aggregate.project.active_calculation_id) || null; }
  function requireIntakeDomain() { const domain = globalObject.YarnAIManualCalculationIntake; if (!domain) fail("INTAKE_DOMAIN_UNAVAILABLE", "Модуль ручного ввода не загружен."); return domain; }
  function requireRequirementsDomain() { const domain = globalObject.YarnAIGarmentMeasurementRequirements; if (!domain) fail("GARMENT_REQUIREMENTS_DOMAIN_UNAVAILABLE", "Модуль профиля мерок изделия не загружен."); return domain; }
  function requireYarnRequirementsDomain() { const domain = globalObject.YarnAIGarmentYarnRequirements; if (!domain) fail("YARN_REQUIREMENTS_DOMAIN_UNAVAILABLE", "Модуль профиля требований к пряже не загружен."); return domain; }
  function measurementValue(list, kind) { const item = Array.isArray(list) ? list.find((entry) => entry.kind === kind) : null; return item && Number.isFinite(item.value) ? item.value : null; }
  function sourceReferences(source) { return [`project:${source?.project?.id || "missing"}`, `analysis:${source?.analysis?.id || "missing"}`, `decision:${source?.decision?.id || "missing"}`, `intake:${source?.intake?.id || "missing"}`]; }
  function issue(reasonCode, severity, category, field, title, explanation, sourceReferencesValue, suggestedAction, blocksConfirmation) { return { reasonCode, severity, category, field, title, explanation, sourceReferences: sourceReferencesValue, suggestedAction, blocksConfirmation }; }
  function normalizeIssue(value) { const result = { reasonCode: String(value.reasonCode), severity: value.severity, category: value.category, field: String(value.field), title: String(value.title), explanation: String(value.explanation), sourceReferences: unique((value.sourceReferences || []).map(String)).sort(), suggestedAction: String(value.suggestedAction), blocksConfirmation: value.blocksConfirmation === true }; result.issueId = `validation-issue:${fnv1a32(result).replace(/^fnv1a32:/, "")}`; return freeze(result); }
  function inputFingerprint(source, context) { const core = copy(source); if (core?.project) delete core.project.repositoryRevision; return fnv1a32({ source: core, contractContext: context }); }
  function semanticFingerprint(result) { const core = copy(result); delete core.semanticFingerprint; return fnv1a32(core); }
  function stateFingerprint(state) { const core = copy(state); delete core.fingerprint; return fnv1a32(core); }
  function snapshotFingerprint(snapshot) { const core = copy(snapshot); delete core.fingerprint; return fnv1a32(core); }
  function timestamp(value) { const result = value || new Date().toISOString(); if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(result) || !Number.isFinite(Date.parse(result))) fail("TIMESTAMP_INVALID", "Время проверки повреждено."); return result; }
  function makeId(prefix) { return globalObject.YarnAIProjectSystem?.uuidv7?.() || globalObject.crypto?.randomUUID?.() || `${prefix}:${Date.now()}`; }
  function round(value, digits) { const factor = 10 ** digits; return Math.round((value + Number.EPSILON) * factor) / factor; }
  function unique(values) { return [...new Set(values)]; }
  function fnv1a32(value) { const source = canonicalize(value); let hash = 0x811c9dc5; for (let index = 0; index < source.length; index += 1) { hash ^= source.charCodeAt(index); hash = Math.imul(hash, 0x01000193); } return `fnv1a32:${(hash >>> 0).toString(16).padStart(8, "0")}`; }
  function canonicalize(value) { if (value === undefined) return "undefined"; if (value === null || typeof value !== "object") return JSON.stringify(value); if (Array.isArray(value)) return `[${value.map(canonicalize).join(",")}]`; return `{${Object.keys(value).filter((key) => value[key] !== undefined).sort().map((key) => `${JSON.stringify(key)}:${canonicalize(value[key])}`).join(",")}}`; }
  function copy(value) { return value === undefined ? undefined : JSON.parse(JSON.stringify(value)); }
  function freeze(value) { if (value && typeof value === "object" && !Object.isFrozen(value)) { Object.freeze(value); Object.values(value).forEach(freeze); } return value; }
  function fail(code, message, details = {}) { throw new ManualIntakeValidationError(code, message, details); }

  const api = Object.freeze({ CONTRACT_VERSION, SCHEMA_VERSION, PROGRESS_KIND, STATUSES, CONSTRUCTION_REQUIREMENTS, CM_TOLERANCE, ManualIntakeValidationError, validateSources, validateForProject, inspectForProject, reconcileForProject, confirmForProject, reopenForProject, syntheticFixtureContext, normalizeContext, requireValidState, stateFingerprint, snapshotFingerprint, sourceFromInspected });
  globalObject.YarnAIManualIntakeValidation = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
