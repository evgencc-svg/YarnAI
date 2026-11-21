"use strict";

(function initializeDesign(root) {
  const KIND = "GARMENT_SET_IN_DESIGN";
  const geometry = root.YarnAIGarmentSetInGeometry;
  function fail(code, message) { throw Object.assign(new Error(message), { code, userMessage: message }); }
  async function inspectForProject(repository, projectId) {
    const checked = await root.YarnAIManualIntakeValidation.reconcileForProject(repository, projectId);
    if (!checked) fail("DESIGN_INPUT_REQUIRED", "Сначала подтверди мерки, пряжу и обработанный образец.");
    const intake = await root.YarnAIManualCalculationIntake.ensureForProject(repository, projectId);
    const aggregate = await repository.getProject(projectId);
    const progress = aggregate.progress.find(p => p.kind === KIND && p.calculation_id === checked.state.calculationId && p.epoch === 1) || null;
    let result = null, problem = null;
    try {
      root.YarnAIGarmentCalculationPreview.build(checked.state, intake.artifact);
      if (progress) {
        const state = progress.state;
        if (state.version !== 1 || state.projectId !== projectId || state.calculationId !== checked.state.calculationId
          || !["review", "confirmed"].includes(state.status)) fail("DESIGN_RECORD_INVALID", "Сохранённая форма имеет несовместимый формат.");
        result = geometry.build(checked.state, intake.artifact, state.design);
        if (result.fingerprint !== state.geometryFingerprint) fail("DESIGN_STALE", "Исходные данные или правила расчёта изменились. Пересчитай форму и подтверди её заново.");
      }
    } catch (error) { result = null; problem = error; }
    let finishing=null,finishingProblem=null;
    if(result && progress?.state.status==="confirmed" && progress.state.finishing) {
      try {
        finishing=root.YarnAIGarmentPoloFinishing.build(result,intake.artifact,progress.state.finishing.input);
        if(finishing.fingerprint!==progress.state.finishing.fingerprint) fail("FINISH_STALE","Отделка рассчитана по прежним правилам или данным. Проверь и пересчитай её.");
      } catch(error) {finishing=null;finishingProblem=error;}
    }
    return { checked, intake, progress, state: progress?.state || null, geometry: result, problem, current: !!result && !problem, finishing, finishingProblem };
  }
  async function write(repository, projectId, inspected, state, operationKind) {
    const calculationId = inspected.checked.state.calculationId;
    const options = { projectStage: "manual_intake_validation_confirmed", operationKind: operationKind || (state.status === "confirmed" ? "GARMENT_DESIGN_CONFIRMED" : "GARMENT_DESIGN_REVIEWED") };
    if (inspected.progress) await repository.updateCalculationProgress(projectId, calculationId, KIND, state, { ...options, baseProgressRevision: inspected.progress.revision });
    else await repository.ensureCalculationProgress(projectId, calculationId, KIND, state, options);
    return inspectForProject(repository, projectId);
  }
  async function saveForProject(repository, projectId, design, baseRevision) {
    const inspected = await inspectForProject(repository, projectId);
    if ((inspected.progress?.revision || 0) !== baseRevision) fail("DESIGN_REVISION_CONFLICT", "Форма уже изменена в другом окне. Открой её заново перед сохранением.");
    const result = geometry.build(inspected.checked.state, inspected.intake.artifact, design);
    if (inspected.current && result.fingerprint === inspected.state.geometryFingerprint) return inspected;
    const history = [...(inspected.state?.history || [])];
    if (inspected.state?.status === "confirmed") history.push({ ...inspected.state, history: undefined });
    const state = { version: 1, projectId, calculationId: inspected.checked.state.calculationId, status: "review", design: result.design,
      geometryFingerprint: result.fingerprint, source: result.source, reviewedAt: new Date().toISOString(), confirmedAt: null, history };
    return write(repository, projectId, inspected, state);
  }
  async function confirmForProject(repository, projectId, reviewedFingerprint, baseRevision) {
    const inspected = await inspectForProject(repository, projectId);
    if (!inspected.current || inspected.state.geometryFingerprint !== reviewedFingerprint) fail("DESIGN_CONFIRMATION_STALE", "Подтверждение недоступно: сначала заново рассчитай и проверь форму.");
    if (inspected.progress.revision !== baseRevision) fail("DESIGN_REVISION_CONFLICT", "Форма уже изменена в другом окне. Открой её заново.");
    if (inspected.state.status === "confirmed") return inspected;
    return write(repository, projectId, inspected, { ...inspected.state, status: "confirmed", confirmedAt: new Date().toISOString() });
  }
  async function saveFinishingForProject(repository,projectId,input,baseRevision) {
    const inspected=await inspectForProject(repository,projectId);
    if(!inspected.current||inspected.state.status!=="confirmed") fail("FINISH_SHAPE_REQUIRED","Сначала подтверди актуальную форму поло.");
    if(inspected.progress.revision!==baseRevision) fail("DESIGN_REVISION_CONFLICT","Данные уже изменены в другом окне. Открой расчёт заново.");
    const result=root.YarnAIGarmentPoloFinishing.build(inspected.geometry,inspected.intake.artifact,input);
    if(inspected.finishing?.fingerprint===result.fingerprint) return inspected;
    const prior=inspected.state.finishing,history=[...(prior?.history||[])];
    if(prior?.status==="confirmed") history.push({...prior,history:undefined});
    const finishing={status:"review",input:result.input,fingerprint:result.fingerprint,confirmedAt:null,history};
    return write(repository,projectId,inspected,{...inspected.state,finishing},"GARMENT_FINISHING_REVIEWED");
  }
  async function confirmFinishingForProject(repository,projectId,reviewedFingerprint,baseRevision) {
    const inspected=await inspectForProject(repository,projectId);
    if(!inspected.finishing||inspected.finishing.fingerprint!==reviewedFingerprint) fail("FINISH_CONFIRMATION_STALE","Заново рассчитай и проверь отделку перед подтверждением.");
    if(inspected.progress.revision!==baseRevision) fail("DESIGN_REVISION_CONFLICT","Данные уже изменены в другом окне. Открой расчёт заново.");
    if(inspected.state.finishing.status==="confirmed") return inspected;
    return write(repository,projectId,inspected,{...inspected.state,finishing:{...inspected.state.finishing,status:"confirmed",confirmedAt:new Date().toISOString()}},"GARMENT_FINISHING_CONFIRMED");
  }
  root.YarnAIGarmentSetInDesign = Object.freeze({ KIND, inspectForProject, saveForProject, confirmForProject,saveFinishingForProject,confirmFinishingForProject });
  if (typeof module !== "undefined" && module.exports) module.exports = root.YarnAIGarmentSetInDesign;
})(typeof window !== "undefined" ? window : globalThis);
