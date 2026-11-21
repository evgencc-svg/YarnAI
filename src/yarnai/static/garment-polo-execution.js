"use strict";
(function initializeExecution(root){
  const KIND="GARMENT_POLO_EXECUTION",planner=root.YarnAIGarmentPoloPlan;
  const clone=v=>JSON.parse(JSON.stringify(v));
  function fail(code,message){throw Object.assign(new Error(message),{code,userMessage:message});}
  function stateFingerprint(state){const {fingerprint,...payload}=state;return planner.fingerprint(payload);}
  function requireState(state,projectId,calculationId){
    if(!state||state.version!==1||state.kind!==KIND||state.projectId!==projectId||state.calculationId!==calculationId||!Array.isArray(state.records)||state.stepIndex!==state.records.length||!Number.isInteger(state.completedRows)||state.completedRows<0||!["active","completed_reported"].includes(state.status)||state.fingerprint!==stateFingerprint(state))fail("EXECUTION_STATE_INVALID","Запись выполнения повреждена или имеет несовместимый формат. Она сохранена, но продолжение закрыто.");
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
  async function startForProject(repository,projectId,baseRevision=0,restart=false){
    const inspected=await inspectForProject(repository,projectId);
    if((inspected.progress?.revision||0)!==baseRevision)fail("EXECUTION_REVISION_CONFLICT","Запись уже изменилась. Обнови страницу.");
    if(inspected.progress&&!restart){if(!inspected.current)throw inspected.problem;return inspected;}
    const plan=planner.build(inspected.design,[]);
    const history=[...(inspected.state?.history||[])];
    if(inspected.state){requireState(inspected.state,projectId,inspected.design.checked.state.calculationId);history.push({...clone(inspected.state),history:[]});}
    const now=new Date().toISOString(),state={version:1,kind:KIND,projectId,calculationId:inspected.design.checked.state.calculationId,planFingerprint:plan.fingerprint,status:"active",stepIndex:0,completedRows:0,records:[],note:"",history,startedAt:now,updatedAt:now,completedAt:null};
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
    return write(repository,projectId,inspected,{...clone(inspected.state),completedRows,note},"GARMENT_POLO_POSITION_SAVED");
  }
  async function completeStepForProject(repository,projectId,stepId,raw,revision){
    const inspected=await inspectForProject(repository,projectId);requireCurrent(inspected,revision);
    const step=inspected.plan.steps[inspected.state.stepIndex];
    if(!step||step.id!==stepId)fail("EXECUTION_STEP_CHANGED","Этот шаг уже завершён или изменился.");
    const done=new Set(inspected.state.records.map(r=>r.stepId));
    if(step.requires?.some(id=>!done.has(id)))fail("EXECUTION_MEASUREMENTS_MISSING","Для шага ещё нет обязательных контрольных измерений.");
    const input=planner.validateCompletion(inspected.design,inspected.plan,step,raw,inspected.state.completedRows);
    const state=clone(inspected.state);
    state.records.push({stepId,stepFingerprint:step.fingerprint,input,completedRows:state.completedRows,note:state.note,reportedAt:new Date().toISOString(),evidence:"user_report"});
    state.stepIndex++;state.completedRows=0;state.note="";
    if(state.stepIndex===inspected.plan.steps.length){state.status="completed_reported";state.completedAt=new Date().toISOString();}
    return write(repository,projectId,inspected,state,"GARMENT_POLO_STEP_REPORTED");
  }
  async function rewindForProject(repository,projectId,index,revision){
    const inspected=await inspectForProject(repository,projectId);requireCurrent(inspected,revision);
    if(!Number.isInteger(index)||index<0||index>=inspected.state.stepIndex)fail("EXECUTION_REWIND_INVALID","Выбери ранее завершённый шаг.");
    const state=clone(inspected.state);
    state.history.push({event:"rewind",at:new Date().toISOString(),fromStep:state.stepIndex,toStep:index,records:state.records.slice(index),completedRows:state.completedRows,note:state.note});
    state.records=state.records.slice(0,index);state.stepIndex=index;state.completedRows=0;state.note="";state.status="active";state.completedAt=null;
    return write(repository,projectId,inspected,state,"GARMENT_POLO_POSITION_REOPENED");
  }
  root.YarnAIGarmentPoloExecution=Object.freeze({KIND,stateFingerprint,inspectForProject,startForProject,savePositionForProject,completeStepForProject,rewindForProject});
  if(typeof module!=="undefined"&&module.exports)module.exports=root.YarnAIGarmentPoloExecution;
})(typeof window!=="undefined"?window:globalThis);
