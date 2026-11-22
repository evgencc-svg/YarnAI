"use strict";
(function initializeExecution(root){
  const KIND="GARMENT_POLO_EXECUTION",planner=root.YarnAIGarmentPoloPlan;
  const policy = root.YarnAIPoloCheckpoints || require("./garment-polo-checkpoints.js");
  const vision = root.YarnAIPatternExecutionVisionReview || require("./pattern-execution-vision-review.js");
  const clone=v=>JSON.parse(JSON.stringify(v));
  function fail(code,message){throw Object.assign(new Error(message),{code,userMessage:message});}
  function stateFingerprint(state){const {fingerprint,...payload}=state;return planner.fingerprint(payload);}
  function requireState(state,projectId,calculationId){
    if (state?.version === 2 && (!policy.modes.includes(state.photoControl?.mode) ||
        !state.photoControl.sessionId || !Number.isInteger(state.photoControl.revision) ||
        !Array.isArray(state.photoControl.reviews))) fail("PHOTO_STATE_INVALID","Журнал фотопроверки повреждён.");
    if(!state||![1,2].includes(state.version)||state.kind!==KIND||state.projectId!==projectId||state.calculationId!==calculationId||!Array.isArray(state.records)||state.stepIndex!==state.records.length||!Number.isInteger(state.completedRows)||state.completedRows<0||!["active","completed_reported"].includes(state.status)||state.fingerprint!==stateFingerprint(state))fail("EXECUTION_STATE_INVALID","Запись выполнения повреждена или имеет несовместимый формат. Она сохранена, но продолжение закрыто.");
  }
  async function inspectForProject(repository,projectId){
    const design=await root.YarnAIGarmentSetInDesign.inspectForProject(repository,projectId);
    const aggregate=await repository.getProject(projectId),calculationId=design.checked.state.calculationId;
    const progress=aggregate.progress.find(p=>p.kind===KIND&&p.calculation_id===calculationId&&p.epoch===1)||null;
    let plan=null,problem=null;
    try{
      if(progress)requireState(progress.state,projectId,calculationId);
      plan=planner.build(design,progress?.state.records||[]);
      if(progress){
        const s=progress.state;
        if(s.planFingerprint!==plan.fingerprint)fail("EXECUTION_SOURCE_STALE","Исходные данные или правила плана изменились. Старые отметки сохранены; продолжать по ним нельзя. Проверь расчёт перед началом нового плана.");
        if(s.stepIndex>plan.steps.length||s.completedRows>(plan.steps[s.stepIndex]?.rows?.length||0))fail("EXECUTION_POSITION_INVALID","Сохранённое место не соответствует плану.");
        for(const [i,record]of s.records.entries()){
          const step=plan.steps[i];
          if(record.stepId!==step.id||record.stepFingerprint!==step.fingerprint)fail("EXECUTION_STEP_STALE","Ранее выполненный шаг относится к другой инструкции. История сохранена.");
          planner.validateCompletion(design,plan,step,record.input,record.completedRows);
          if (s.version===2) {
            const atStep={...s,photoControl:{...s.photoControl,revision:record.photoRevision,pointRevisions:record.pointRevisions}};
            const points=policy.forStep(step,design,s.photoControl.mode,s.records.slice(0,i));
            if (!Array.isArray(record.reviews) || points.some(point=>!record.reviews.some(review=>policy.passed(review,atStep,step,point))))
              fail("PHOTO_RECORD_STALE","Фотопроверка завершённого шага относится к другой инструкции. История сохранена.");
          }
        }
        if((s.status==="completed_reported")!==(s.stepIndex===plan.steps.length))fail("EXECUTION_COMPLETION_INVALID","Итоговый статус не совпадает с выполненными шагами.");
      }
    }catch(error){problem=error;}
    return{design,aggregate,progress,state:progress?.state||null,plan,problem,current:!!plan&&!problem};
  }
  function requireCurrent(inspected,revision){
    if(!inspected.current)throw inspected.problem||new Error("EXECUTION_UNAVAILABLE");
    if(!inspected.progress)fail("EXECUTION_NOT_STARTED","Сначала начни выполнение плана.");
    if(inspected.progress.revision!==revision)fail("EXECUTION_REVISION_CONFLICT","Запись уже изменена в другом окне. Обнови страницу перед сохранением.");
  }
  async function write(repository,projectId,inspected,state,operationKind){
    state.updatedAt=new Date().toISOString();state.fingerprint=stateFingerprint(state);
    const options={projectStage:"garment_polo_execution",operationKind};
    if(inspected.progress)await repository.updateCalculationProgress(projectId,state.calculationId,KIND,state,{...options,baseProgressRevision:inspected.progress.revision});
    else await repository.ensureCalculationProgress(projectId,state.calculationId,KIND,state,options);
    return inspectForProject(repository,projectId);
  }
  async function startForProject(repository,projectId,baseRevision=0,restart=false,mode="experienced"){
    const inspected=await inspectForProject(repository,projectId);
    if((inspected.progress?.revision||0)!==baseRevision)fail("EXECUTION_REVISION_CONFLICT","Запись уже изменилась. Обнови страницу.");
    if(inspected.progress&&!restart){if(!inspected.current)throw inspected.problem;return inspected;}
    const plan=planner.build(inspected.design,[]);
    const history=[...(inspected.state?.history||[])];
    if(inspected.state){requireState(inspected.state,projectId,inspected.design.checked.state.calculationId);history.push({...clone(inspected.state),history:[]});}
    const now=new Date().toISOString(),state={version:2,kind:KIND,projectId,calculationId:inspected.design.checked.state.calculationId,planFingerprint:plan.fingerprint,status:"active",stepIndex:0,completedRows:0,records:[],note:"",history,startedAt:now,updatedAt:now,completedAt:null};
    if (!policy.modes.includes(mode)) fail("PHOTO_MODE_INVALID","Выбери режим фотопроверки.");
    state.photoControl = {mode, sessionId:root.YarnAIProjectSystem.uuidv7(), revision:baseRevision+1, reviews:[]};
    return write(repository,projectId,inspected,state,restart?"GARMENT_POLO_RESTARTED":"GARMENT_POLO_STARTED");
  }
  async function savePositionForProject(repository,projectId,stepId,completedRows,note,revision){
    const inspected=await inspectForProject(repository,projectId);requireCurrent(inspected,revision);
    const step=inspected.plan.steps[inspected.state.stepIndex];
    if(!step||step.id!==stepId)fail("EXECUTION_STEP_CHANGED","Текущий шаг уже изменился.");
    const max=step.rows?.length||0;
    if(!Number.isInteger(completedRows)||completedRows<0||completedRows>max)fail("EXECUTION_ROW_INVALID",`Число законченных рядов должно быть от 0 до ${max}.`);
    if(typeof note!=="string"||note.length>2000)fail("EXECUTION_NOTE_INVALID","Заметка должна быть короче 2000 символов.");
    if(completedRows===inspected.state.completedRows&&note===inspected.state.note)return inspected;
    const stop = policy.pending(inspected).find(point => completedRows > point.row);
    if (stop) fail("PHOTO_REQUIRED", "Сначала сохрани место на ряду " + stop.row + " и пройди фотопроверку.");
    const state = {...clone(inspected.state),completedRows,note};
    if (completedRows < inspected.state.completedRows && state.photoControl) {
      const control=state.photoControl;
      const touched=policy.forStep(step,inspected.design,control.mode,state.records).filter(point=>point.row>=completedRows);
      const reopened=new Set(touched.map(point=>point.id));
      const affected=control.reviews.filter(review=>reopened.has(review.identity.checkpointIdentity.checkpointId));
      if (affected.length) {
        state.history.push({event:"row_rework", at:new Date().toISOString(), reviews:affected});
        control.reviews=control.reviews.filter(review=>!affected.includes(review));
        control.pointRevisions={...control.pointRevisions};
        for (const point of touched) control.pointRevisions[point.id]=revision+1;
      }
    }
    return write(repository,projectId,inspected,state,"GARMENT_POLO_POSITION_SAVED");
  }
  async function completeStepForProject(repository,projectId,stepId,raw,revision){
    const inspected=await inspectForProject(repository,projectId);requireCurrent(inspected,revision);
    const step=inspected.plan.steps[inspected.state.stepIndex];
    if(!step||step.id!==stepId)fail("EXECUTION_STEP_CHANGED","Этот шаг уже завершён или изменился.");
    const done=new Set(inspected.state.records.map(r=>r.stepId));
    if(step.requires?.some(id=>!done.has(id)))fail("EXECUTION_MEASUREMENTS_MISSING","Для шага ещё нет обязательных контрольных измерений.");
    const input=planner.validateCompletion(inspected.design,inspected.plan,step,raw,inspected.state.completedRows);
    const state=clone(inspected.state);
    if (policy.pending(inspected).length) fail("PHOTO_REQUIRED","Перед продолжением проверь результат по фото.");
    state.records.push({stepId,stepFingerprint:step.fingerprint,input,completedRows:state.completedRows,note:state.note,reportedAt:new Date().toISOString(),evidence:"user_report"});
    if (state.photoControl) {
      const record = state.records.at(-1);
      record.reviews = state.photoControl.reviews;
      record.photoRevision = state.photoControl.revision;
      if (state.photoControl.pointRevisions) record.pointRevisions=state.photoControl.pointRevisions;
      delete state.photoControl.pointRevisions;
      if (record.reviews.some(r => r.status === "verified_continue")) record.evidence="photo_and_user_report";
      state.photoControl.reviews=[];
      state.photoControl.revision=revision+1;
    }
    // An accepted slit length can still be too short for the chosen buttons.
    // Compile its dependent steps before committing the measurement and position.
    if (stepId === "front_measure") planner.build(inspected.design,state.records);
    state.stepIndex++;state.completedRows=0;state.note="";
    if(state.stepIndex===inspected.plan.steps.length){state.status="completed_reported";state.completedAt=new Date().toISOString();}
    return write(repository,projectId,inspected,state,"GARMENT_POLO_STEP_REPORTED");
  }
  async function rewindForProject(repository,projectId,index,revision){
    const inspected=await inspectForProject(repository,projectId);requireCurrent(inspected,revision);
    if(!Number.isInteger(index)||index<0||index>=inspected.state.stepIndex)fail("EXECUTION_REWIND_INVALID","Выбери ранее завершённый шаг.");
    const state=clone(inspected.state);
    state.history.push({event:"rewind",at:new Date().toISOString(),fromStep:state.stepIndex,toStep:index,records:state.records.slice(index),completedRows:state.completedRows,note:state.note});
    if (state.photoControl) {
      state.history.at(-1).reviews = state.photoControl.reviews;
      delete state.photoControl.pointRevisions;
      state.photoControl.reviews=[];
      state.photoControl.revision=revision+1;
    }
    state.records=state.records.slice(0,index);state.stepIndex=index;state.completedRows=0;state.note="";state.status="active";state.completedAt=null;
    return write(repository,projectId,inspected,state,"GARMENT_POLO_POSITION_REOPENED");
  }
  function currentPoint(view) {
    const step = view.plan.steps[view.state.stepIndex];
    const point = policy.pending(view).find(p => p.row === view.state.completedRows);
    if (!point) fail("PHOTO_NOT_DUE","Сохрани связанные ряды до контрольной точки.");
    const reviews = view.state.photoControl.reviews.filter(r => policy.matches(r,view.state,step,point));
    return {point, step, reviews, latest:reviews.at(-1)};
  }
  async function selectPhotos(repository,projectId,files,revision) {
    const view=await inspectForProject(repository,projectId);
    requireCurrent(view,revision);
    const {point,step,reviews,latest}=currentPoint(view);
    if (!files.length || files.length>3 || files.some(f=>!["image/jpeg","image/png","image/webp"].includes(f.type)))
      fail("PHOTO_SELECTION","Выбери от одного до трёх снимков JPEG, PNG или WebP.");
    if (files.reduce((sum,f)=>sum+f.size,0)>8*1024*1024) fail("PHOTO_SIZE","Выбери снимки общим размером до 8 МБ.");
    const followUp=latest?.status==="more_evidence_required";
    if (followUp && files.length!==1) fail("PHOTO_FOLLOW_UP","Добавь один новый снимок с полным видом нужного участка.");
    const photos=[];
    for (const file of files) photos.push(await repository.addPhoto(projectId,file,{purpose:"STEP_VISION_REVIEW",
      calculation_id:view.state.calculationId, display_name:file.name || "Фото вязания"}));
    const selected=vision.normalizeStoredPhotos(photos);
    const used=reviews.filter(r=>r===latest || !["photos_ready","automatic_unavailable"].includes(r.status));
    if (used.some(r=>r.photos.some(p=>selected.some(s=>s.sha256===p.sha256))))
      fail("PHOTO_REPEATED","Этот снимок уже сохранён. Для новой проверки покажи исправление или другой ракурс.");
    const identity=policy.identity(view.state,step,point);
    const now=new Date().toISOString();
    const review={schemaVersion:1,identity,reviewSessionId:root.YarnAIProjectSystem.uuidv7(),
      photos:selected,status:"photos_ready",createdAt:now,updatedAt:now,automaticReview:{}, request:{
        identity,photos:selected,followUp,expectedVisibleState:{actionTitle:step.title,
          instruction:point.risk,expectedResult:point.expected,references:[point.id]},
        photoRequirements:[...point.requirements,...(followUp?latest.response.missing_evidence.slice(0,3):[])],
        allowedChecks:point.checks,visualLimits:["Размеры требуют видимой шкалы. Точный счёт требует полного различимого участка."]}};
    const state=clone(view.state);
    state.photoControl.reviews.push(review);
    return write(repository,projectId,view,state,"GARMENT_POLO_PHOTOS_SELECTED");
  }
  async function submitPhotos(repository,projectId,revision) {
    const view=await inspectForProject(repository,projectId);
    requireCurrent(view,revision);
    const {point,step,latest:review}=currentPoint(view);
    if (!review || !["photos_ready","submitting","automatic_unavailable","delivery_unknown"].includes(review.status))
      fail("PHOTO_NEW_REQUIRED","Сначала сохрани новые снимки для этой проверки.");
    const records=await Promise.all(review.photos.map(p=>repository.getPhoto(projectId,p.photoId)));
    const payload=await vision.buildServerRequest({visionReview:review},records);
    const state=clone(view.state), update=state.photoControl.reviews.find(r=>r.reviewSessionId===review.reviewSessionId);
    let config;
    try { config=await vision.fetchGatewayConfiguration("polo"); } catch { config={enabled:false}; }
    if (!config.enabled) {
      if (!["delivery_unknown","submitting"].includes(update.status)) update.status="automatic_unavailable";
      update.updatedAt=new Date().toISOString();
      return write(repository,projectId,view,state,"GARMENT_POLO_REVIEW_OFFLINE");
    }
    update.automaticReview={provider:config.provider,model:config.model};
    update.status="submitting";update.updatedAt=new Date().toISOString();
    const saved=await write(repository,projectId,view,state,"GARMENT_POLO_REVIEW_SUBMITTED");
    requireCurrent(saved,revision+1);
    if (saved.state.fingerprint!==state.fingerprint) fail("PHOTO_CONFLICT","Шаг изменился до отправки. Открой его заново.");
    try {
      update.response=vision.validateSanitizedVerdict(update,await vision.submitServerReview(payload));
      update.status=update.response.verdict;
      if (update.status==="verified_continue" && !policy.passed(update,state,step,point))
        fail("PHOTO_EVIDENCE_INVALID","Признаков для продолжения недостаточно.");
    } catch {
      delete update.response;
      update.status="delivery_unknown";
    }
    update.updatedAt=new Date().toISOString();
    const latest=await inspectForProject(repository,projectId);
    requireCurrent(latest,saved.progress.revision);
    return write(repository,projectId,latest,state,"GARMENT_POLO_REVIEW_RESULT");
  }
  async function manualCheck(repository,projectId,revision) {
    const view=await inspectForProject(repository,projectId);
    requireCurrent(view,revision);
    const {point,latest,reviews}=currentPoint(view);
    if (!point.allowManual || !["automatic_unavailable","cannot_determine"].includes(latest?.status) ||
        reviews.some(r=>r.status==="correction_required"))
      fail("PHOTO_MANUAL_FORBIDDEN","Для продолжения нужна успешная фотопроверка.");
    const state=clone(view.state);
    state.photoControl.reviews.push({identity:latest.identity,status:"self_confirmed",photos:[],
      manual:point.manual,updatedAt:new Date().toISOString()});
    return write(repository,projectId,view,state,"GARMENT_POLO_MANUAL_CHECK");
  }
  root.YarnAIGarmentPoloExecution=Object.freeze({KIND,selectPhotos,submitPhotos,manualCheck,stateFingerprint,inspectForProject,startForProject,savePositionForProject,completeStepForProject,rewindForProject});
  if(typeof module!=="undefined"&&module.exports)module.exports=root.YarnAIGarmentPoloExecution;
})(typeof window!=="undefined"?window:globalThis);
