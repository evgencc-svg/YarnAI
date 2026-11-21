"use strict";

const assert = require("node:assert/strict");
const { afterEach, test } = require("node:test");
require("fake-indexeddb/auto");

global.window = globalThis;
require("../src/yarnai/static/project-system.js");
const garment = require("../src/yarnai/static/garment-reference-analysis.js");
const requirements = require("../src/yarnai/static/garment-measurement-requirements.js");
const yarnRequirements = require("../src/yarnai/static/garment-yarn-requirements.js");
const intake = require("../src/yarnai/static/manual-calculation-intake.js");

const system = global.YarnAIProjectSystem;
const repositories = [];
const configuration = { provider: "openai", model: "gpt-5.6-terra", enabled: true };

function technologyOption(optionId, name) {
  return {
    option_id: optionId,
    name,
    construction_summary: "Отдельный проверяемый маршрут для теста подготовки данных.",
    knitting_direction: "Определяется названием маршрута",
    seam_mode: "Зависит от маршрута",
    major_components: ["Корпус", "Рукава"],
    shaping_approach: "Форма будет определяться только после отдельного расчётного контракта.",
    yarn_characteristics: ["Выбираются пользователем"],
    tools_and_techniques: ["Спицы"],
    expected_visual_similarity: "Сохраняется видимый силуэт.",
    deliberate_differences: [],
    advantages: ["Маршрут явно назван"],
    risks: ["Фотография не содержит точных размеров"],
    difficulty_explanation: "Сложность будет уточнена после фактических входных данных.",
    missing_inputs_before_calculation: ["Мерки", "Пряжа", "Спицы", "Образец плотности"],
    evidence_observation_ids: ["observed:silhouette"],
    assumption_inference_ids: ["inferred:fit"],
  };
}

function providerResponse(state) {
  const request = garment.buildAnalysisRequest(state, { requestId: "request:manual-intake" });
  return {
    contract_version: garment.CONTRACT_VERSION,
    source_identity: {
      project_id: request.project_id,
      project_revision: request.project_revision,
      reference_photos: request.reference_photos.map((entry) => ({ photo_id: entry.photo_id, sha256: entry.sha256 })),
      request_fingerprint: request.request_fingerprint,
    },
    provider: { provider: "openai", model: "gpt-5.6-terra" },
    visible_observations: [{ id: "observed:silhouette", field: "silhouette", value: "Прямой силуэт", evidence_photo_ids: [request.reference_photos[0].photo_id], status: "observed", explanation: "Силуэт виден на тестовой фотографии." }],
    inferences: [{ id: "inferred:fit", field: "fit", value: "Возможна свободная посадка", status: "inferred", uncertainty: "medium", why_plausible: "Есть видимый объём.", confirm_or_reject: "Нужны фактические мерки." }],
    unknowns: [{ id: "unknown:gauge", field: "exact_gauge", explanation: "Плотность по фотографии неизвестна." }],
    questions: [],
    technology_options: [
      technologyOption("option:raglan", intake.MANUAL_OPTION_NAMES[0]),
      technologyOption("option:set-in", intake.MANUAL_OPTION_NAMES[1]),
      technologyOption("option:industrial", intake.INDUSTRIAL_OPTION_NAME),
    ],
  };
}

async function repository() {
  const value = new system.ProjectRepository();
  repositories.push(value);
  await value.initialize();
  return value;
}

async function countStore(repositoryValue, storeName) {
  const database = await repositoryValue._database();
  const transaction = database.transaction(storeName, "readonly");
  const request = transaction.objectStore(storeName).count();
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function seed(optionId = "option:raglan") {
  const repo = await repository();
  const project = await repo.createProject({ title: "TEST ONLY — manual intake", draft_input: { workflow_intent: { version: 1, kind: "garment_reference" } } });
  let inspected = await garment.addPhotosForProject(repo, project.project_id, [new Blob([Buffer.from("front")], { type: "image/png" })]);
  inspected = await garment.applyProviderResponseForProject(repo, project.project_id, providerResponse(inspected.state), configuration, { allowTestProvider: true, requestId: "request:manual-intake" });
  inspected = await garment.selectDraftForProject(repo, project.project_id, optionId);
  inspected = await garment.confirmDecisionForProject(repo, project.project_id);
  return { repo, project, inspected };
}

afterEach(async () => {
  await Promise.all(repositories.splice(0).map((entry) => entry.close()));
  await new Promise((resolve, reject) => {
    const request = indexedDB.deleteDatabase(system.DB_NAME);
    request.onsuccess = resolve;
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error("blocked"));
  });
});

test("an arbitrary provider title needs explicit construction choice, preserved across reopen and downstream profiles", async () => {
  const {repo,project,inspected}=await seed("option:set-in");
  const response=providerResponse(inspected.state);
  response.technology_options[1].name="Похожая вещь из отдельных деталей";
  let current=await garment.applyProviderResponseForProject(repo,project.project_id,response,configuration,{allowTestProvider:true,requestId:"request:manual-intake"});
  current=await garment.selectDraftForProject(repo,project.project_id,"option:set-in");
  const plain=garment.confirmTechnologyDecision(current.state);
  assert.equal(intake.classifyTechnologyHandoff(garment.technologyDecisionHandoff(plain)),"unsupported");
  await assert.rejects(()=>garment.confirmDecisionForProject(repo,project.project_id,{constructionIdentity:"invented"}),{code:"CONSTRUCTION_CHOICE_INVALID"});
  current=await garment.confirmDecisionForProject(repo,project.project_id,{constructionIdentity:"seamed_set_in_sleeve"});
  const handoff=garment.technologyDecisionHandoff(current.state);
  assert.equal(handoff.selectedOption.name,"Похожая вещь из отдельных деталей");
  assert.equal(handoff.selectedConstructionIdentity,"seamed_set_in_sleeve");
  assert.equal(intake.classifyTechnologyHandoff(handoff),"manual");
  assert.notEqual(handoff.technologyDecisionFingerprint,garment.technologyDecisionHandoff(plain).technologyDecisionFingerprint);
  assert.equal(requirements.resolveFromTechnologyDecision(handoff).constructionIdentity,"seamed_set_in_sleeve");
  const yarn=yarnRequirements.resolveFromTechnologyDecision(handoff);
  assert.equal(yarn.constructionIdentity,"seamed_set_in_sleeve");
  assert.equal(yarnRequirements.requireValidProfile(yarn),true);
  await intake.ensureForProject(repo,project.project_id);
  await repo.close();const reopened=await repository();
  const restored=await garment.ensureForProject(reopened,project.project_id);
  assert.equal(restored.state.ownerDecision.constructionIdentity,"seamed_set_in_sleeve");
  await garment.reopenDecisionForProject(reopened,project.project_id);
  const reset=await garment.ensureForProject(reopened,project.project_id);
  assert.equal(reset.state.ownerDecision.constructionIdentity,undefined);
});

test("only a confirmed manual handoff opens the intake route", async () => {
  const { repo, project, inspected } = await seed("option:raglan");
  const handoff = garment.technologyDecisionHandoff(inspected.state);
  assert.equal(intake.classifyTechnologyHandoff(handoff), "manual");
  assert.ok(handoff.analysisId);
  assert.ok(Number.isSafeInteger(handoff.analysisRevision));
  assert.equal(handoff.analysisRequestId, "request:manual-intake");
  assert.ok(handoff.technologyDecisionId);
  assert.match(handoff.technologyDecisionFingerprint, /^fnv1a32:[0-9a-f]{8}$/);
  assert.equal(handoff.technologyDecisionRevision, inspected.state.revision);
  const prepared = await intake.ensureForProject(repo, project.project_id);
  assert.equal(prepared.artifact.status, "draft");
  assert.equal(prepared.artifact.source.technologyDecisionId, handoff.technologyDecisionId);
  assert.equal(prepared.artifact.garmentRequirementsProfile.contractVersion, requirements.CONTRACT_VERSION);
  assert.equal(prepared.artifact.source.garmentRequirements.profileFingerprint, prepared.artifact.garmentRequirementsProfile.canonicalFingerprint);
  assert.equal(prepared.artifact.yarnRequirementsProfile.contractVersion, yarnRequirements.CONTRACT_VERSION);
  assert.equal(prepared.artifact.source.yarnRequirements.profileFingerprint, prepared.artifact.yarnRequirementsProfile.canonicalFingerprint);
  assert.equal(prepared.artifact.yarn.strandCount, null);
});

test("an unconfirmed decision fails closed and creates no intake progress", async () => {
  const { repo, project } = await seed("option:set-in");
  await garment.reopenDecisionForProject(repo, project.project_id);
  await assert.rejects(() => intake.ensureForProject(repo, project.project_id), { code: "MANUAL_DECISION_REQUIRED" });
  const aggregate = await repo.getProject(project.project_id);
  assert.equal(aggregate.progress.some((entry) => entry.kind === intake.PROGRESS_KIND), false);
});

test("the industrial option remains informational and cannot create an intake", async () => {
  const { repo, project, inspected } = await seed("option:industrial");
  assert.equal(intake.classifyTechnologyHandoff(garment.technologyDecisionHandoff(inspected.state)), "industrial");
  await assert.rejects(() => intake.ensureForProject(repo, project.project_id), { code: "INDUSTRIAL_ROUTE_UNSUPPORTED", message: intake.INDUSTRIAL_MESSAGE });
  const aggregate = await repo.getProject(project.project_id);
  assert.equal(aggregate.progress.some((entry) => entry.kind === intake.PROGRESS_KIND), false);
});

test("partial data stays separated, empty values remain null, and gauge source is preserved", async () => {
  const { repo, project, inspected: garmentBefore } = await seed();
  const analysisBefore = JSON.stringify(garmentBefore.state.analysis);
  await intake.ensureForProject(repo, project.project_id);
  const saved = await intake.saveDraftForProject(repo, project.project_id, {
    targetSizing: {
      selectedSize: "L",
      bodyMeasurements: { bust_circumference: "96", waist_circumference: "" },
      finishedGarmentMeasurements: { finished_bust_circumference: "108" },
      ease: { bust_ease: "12" },
    },
    yarn: { selectionStatus: "not_selected", name: "", lengthMeters: "" },
    needles: { selectionStatus: "selected", primaryMm: "4.5", additionalMm: "3.5, 4" },
    gauge: { sourceMeasurement: { stitches: "23", widthCm: "12.5", rows: "31", heightCm: "14", needleSizeMm: "4.5", afterTreatment: "yes" } },
    notes: "Нужно уточнить длину после примерки.",
  });
  assert.deepEqual(saved.artifact.targetSizing.bodyMeasurements.map((entry) => entry.measurementType), ["body"]);
  assert.deepEqual(saved.artifact.targetSizing.finishedGarmentMeasurements.map((entry) => entry.measurementType), ["finished_garment"]);
  assert.deepEqual(saved.artifact.targetSizing.ease.map((entry) => entry.measurementType), ["ease"]);
  assert.equal(saved.artifact.targetSizing.bodyMeasurements.some((entry) => entry.kind === "waist_circumference"), false);
  assert.equal(saved.artifact.yarn.lengthMeters, null);
  assert.equal(saved.artifact.yarn.strandCount, null);
  assert.deepEqual(saved.artifact.gauge.sourceMeasurement, { stitches: 23, widthCm: 12.5, rows: 31, heightCm: 14, needleSizeMm: 4.5, afterTreatment: "yes" });
  assert.deepEqual(saved.artifact.gauge.normalizedPer10Cm, { stitchesPer10Cm: 18.4, rowsPer10Cm: 22.1429, unit: "10_cm", derivation: "deterministic_from_source_measurement" });
  const garmentAfter = await garment.ensureForProject(repo, project.project_id);
  assert.equal(JSON.stringify(garmentAfter.state.analysis), analysisBefore);
});

test("draft and local photo survive repository close and reopen without network", async () => {
  const originalFetch = global.fetch;
  let fetchCalls = 0;
  global.fetch = async () => { fetchCalls += 1; throw new Error("external access forbidden"); };
  try {
    const { repo, project } = await seed();
    await intake.ensureForProject(repo, project.project_id);
    let saved = await intake.saveDraftForProject(repo, project.project_id, { targetSizing: { selectedSize: "48" }, notes: "Частичный черновик" });
    saved = await intake.addPhotoForProject(repo, project.project_id, new Blob([Buffer.from("swatch")], { type: "image/png" }), "swatch");
    const expected = { intakeId: saved.artifact.intakeId, fingerprint: saved.artifact.fingerprint, selectedSize: saved.artifact.targetSizing.selectedSize, photoId: saved.artifact.additionalPhotos[0].photoId };
    const photoRecord = await repo.getPhoto(project.project_id, expected.photoId);
    assert.equal(photoRecord.metadata.consent_state, "LOCAL_ONLY");
    assert.equal(photoRecord.metadata.sync_policy, "NEVER");
    assert.equal(photoRecord.metadata.upload_status, "LOCAL_ONLY");
    await repo.close(); repositories.splice(repositories.indexOf(repo), 1);
    const reopened = await repository();
    const restored = await intake.ensureForProject(reopened, project.project_id);
    assert.equal(restored.artifact.intakeId, expected.intakeId);
    assert.equal(restored.artifact.fingerprint, expected.fingerprint);
    assert.equal(restored.artifact.targetSizing.selectedSize, expected.selectedSize);
    assert.equal(restored.artifact.additionalPhotos[0].photoId, expected.photoId);
    assert.equal(fetchCalls, 0);
  } finally {
    global.fetch = originalFetch;
  }
});

test("photo deletion atomically updates one project progress and removes only its blob", async () => {
  const { repo, project } = await seed();
  await intake.ensureForProject(repo, project.project_id);
  let saved = await intake.addPhotoForProject(repo, project.project_id, new Blob([Buffer.from("label")], { type: "image/png" }), "yarn_label");
  const removedPhotoId = saved.artifact.additionalPhotos.find((entry) => entry.role === "yarn_label").photoId;
  saved = await intake.addPhotoForProject(repo, project.project_id, new Blob([Buffer.from("yarn")], { type: "image/png" }), "yarn_appearance");
  const preservedPhotoId = saved.artifact.additionalPhotos.find((entry) => entry.role === "yarn_appearance").photoId;
  const nextState = intake.updateDraft(saved.state, { notes: "Атомарное удаление фото" }, { now: "2026-09-04T10:00:00.000Z" });
  const otherProject = await repo.createProject({ title: "TEST ONLY — foreign photo" });
  const foreignPhoto = await repo.addPhoto(otherProject.project_id, new Blob([Buffer.from("foreign")], { type: "image/png" }), { purpose: intake.PHOTO_PURPOSE });
  const before = await repo.getProject(project.project_id);
  const blobCountBefore = await countStore(repo, "photo_blobs");
  const checkpointCountBefore = await countStore(repo, "checkpoints");

  await assert.rejects(
    () => repo.deletePhotoAndUpdateCalculationProgress(project.project_id, foreignPhoto.photo_id, saved.calculation.calculation_id, intake.PROGRESS_KIND, nextState, { baseProgressRevision: saved.progress.revision, expectedPurpose: intake.PHOTO_PURPOSE }),
    { code: "INVALID_PHOTO_SCOPE" },
  );
  await assert.rejects(
    () => repo.deletePhotoAndUpdateCalculationProgress(project.project_id, removedPhotoId, saved.calculation.calculation_id, intake.PROGRESS_KIND, nextState, { baseProgressRevision: saved.progress.revision + 1, expectedPurpose: intake.PHOTO_PURPOSE }),
    { code: "PROGRESS_REVISION_CONFLICT" },
  );
  assert.ok(await repo.getPhoto(otherProject.project_id, foreignPhoto.photo_id));
  assert.ok(await repo.getPhoto(project.project_id, removedPhotoId));
  assert.equal(await countStore(repo, "photo_blobs"), blobCountBefore);

  const result = await repo.deletePhotoAndUpdateCalculationProgress(
    project.project_id,
    removedPhotoId,
    saved.calculation.calculation_id,
    intake.PROGRESS_KIND,
    nextState,
    {
      baseProgressRevision: saved.progress.revision,
      expectedPurpose: intake.PHOTO_PURPOSE,
      projectStage: "manual_calculation_intake_draft",
      operationKind: "GARMENT_ACTUAL_YARN_PHOTO_DELETED",
      timestamp: "2026-09-04T10:00:00.000Z",
    },
  );

  const after = await repo.getProject(project.project_id);
  assert.equal(result.project.revision, before.project.revision + 1);
  assert.equal(result.progress.revision, saved.progress.revision + 1);
  assert.equal(after.progress.find((entry) => entry.progress_id === saved.progress.progress_id).state.fingerprint, nextState.fingerprint);
  assert.equal(after.operations.length, before.operations.length + 1);
  const priorOperationIds = new Set(before.operations.map((entry) => entry.operation_id));
  const newOperations = after.operations.filter((entry) => !priorOperationIds.has(entry.operation_id));
  assert.equal(newOperations.length, 1);
  assert.equal(newOperations[0].kind, "GARMENT_ACTUAL_YARN_PHOTO_DELETED");
  assert.equal(await countStore(repo, "checkpoints"), checkpointCountBefore + 1);
  assert.equal(await countStore(repo, "photo_blobs"), blobCountBefore - 1);
  assert.equal(await repo.getPhoto(project.project_id, removedPhotoId), null);
  assert.ok(await repo.getPhoto(project.project_id, preservedPhotoId));
  const deletedMetadata = after.photos.find((entry) => entry.photo_id === removedPhotoId);
  assert.equal(deletedMetadata.status, "DELETED");
  assert.ok(deletedMetadata.deleted_at);
});

test("a changed technology decision makes the prior draft stale and preserves its history", async () => {
  const { repo, project } = await seed("option:raglan");
  const created = await intake.ensureForProject(repo, project.project_id);
  const oldId = created.artifact.intakeId;
  await garment.reopenDecisionForProject(repo, project.project_id);
  const reconciled = await intake.reconcileForProject(repo, project.project_id);
  assert.equal(reconciled.state.status, "stale");
  assert.equal(reconciled.state.activeIntakeId, null);
  assert.equal(reconciled.state.intakes[0].intakeId, oldId);
  assert.equal(reconciled.state.intakes[0].status, "stale");
  assert.deepEqual(reconciled.state.intakes[0].staleReasons, ["technology_decision_not_current"]);
});
