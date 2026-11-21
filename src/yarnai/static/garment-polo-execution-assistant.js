"use strict";
(function initializePoloExecutionUI(root){
  if(typeof document==="undefined")return;
  const byId=id=>document.getElementById(`execution-${id}`),domain=root.YarnAIGarmentPoloExecution,planner=root.YarnAIGarmentPoloPlan;
  let repository,projectId,inspected,busy=false;const fields={};
  function p(parent,text){const e=document.createElement("p");e.textContent=text;parent.append(e);}
  function error(e){byId("error").hidden=false;byId("error").textContent=e.userMessage||e.message||"Не удалось выполнить действие.";}
  function paragraphs(parent,values){parent.replaceChildren();for(const text of values)p(parent,text);}
  async function init(){
    projectId=new URLSearchParams(root.location.search).get("project");
    if(!root.YarnAIProjectSystem.isUuidv7(projectId))throw new Error("Не указан корректный проект.");
    byId("intake").href=`/manual-calculation-intake?project=${encodeURIComponent(projectId)}`;
    repository=new root.YarnAIProjectSystem.ProjectRepository();await repository.initialize();
    inspected=await domain.inspectForProject(repository,projectId);render();
  }
  function rowTable(parent,rows){
    const table=document.createElement("table");table.className="polo-table";const head=document.createElement("tr");
    for(const text of ["Ряд","Действия","После ряда"]){const th=document.createElement("th");th.textContent=text;head.append(th);}table.append(head);
    for(const row of rows){const tr=document.createElement("tr");for(const text of [`${row.row} · ${row.side}`,row.text,`${row.afterStitches} п.${row.halves?` (А ${row.halves.A}; Б ${row.halves.B})`:""}`]){const td=document.createElement("td");td.textContent=text;tr.append(td);}table.append(tr);}parent.replaceChildren(table);
  }
  function preview(step){const container=byId("preview");container.replaceChildren();const title=document.createElement("h3");title.textContent=step.title;container.append(title);for(const text of step.text)p(container,text);if(step.rows){p(container,`Рядов в шаге: ${step.rows.length}. Ниже полная таблица.`);const table=document.createElement("div");rowTable(table,step.rows);container.append(table);}for(const field of step.fields)p(container,`Контроль: ${field.label}${field.target!==undefined?` — расчёт ${planner.fmt(field.target)}, допустимое отклонение ${planner.fmt(field.tolerance)}`:""}.`);byId("preview-details").open=true;}
  function render(){
    byId("error").hidden=true;
    byId("project-title").textContent=inspected.aggregate.project.title;
    byId("current").hidden=true;byId("finished").hidden=true;byId("start-panel").hidden=true;byId("restart-panel").hidden=true;byId("rewind-panel").hidden=true;
    if(inspected.problem){error(inspected.problem);try{planner.build(inspected.design,[]);byId("restart-panel").hidden=!inspected.state;}catch(_){} }
    const plan=inspected.plan;
    if(!plan)return;
    byId("outline").replaceChildren(...plan.steps.map((step,index)=>{const item=document.createElement("li"),button=document.createElement("button");button.type="button";button.textContent=`${index< (inspected.state?.stepIndex||0)?"✓ ":""}${step.title}`;button.className=index===inspected.state?.stepIndex?"current":"";button.addEventListener("click",()=>preview(step));item.append(button);return item;}));
    byId("guides").replaceChildren(...plan.guides.map(guide=>{const link=document.createElement("a"),line=document.createElement("p");link.href=guide.url;link.target="_blank";link.rel="noreferrer";link.textContent=guide.title;line.append(link);return line;}));
    if(!inspected.current)return;
    if(!inspected.state){byId("start-panel").hidden=false;return;}
    const state=inspected.state;
    if(state.stepIndex>0){byId("rewind-panel").hidden=false;byId("rewind-to").replaceChildren(...plan.steps.slice(0,state.stepIndex).map((step,i)=>{const option=document.createElement("option");option.value=i;option.textContent=`${i+1}. ${step.title}`;return option;}));byId("rewind-to").value=state.stepIndex-1;}
    if(state.status==="completed_reported"){byId("finished").hidden=false;return;}
    byId("current").hidden=false;
    const step=plan.steps[state.stepIndex];byId("progress-label").textContent=`Шаг ${state.stepIndex+1} из ${plan.steps.length}. Последнее сохранение: ${new Date(state.updatedAt).toLocaleString("ru-RU")}.`;
    byId("progress").max=plan.steps.length;byId("progress").value=state.stepIndex;
    byId("step-title").textContent=step.title;paragraphs(byId("step-text"),step.text);
    byId("row-panel").hidden=!step.rows;
    byId("row-number").value=state.completedRows;byId("row-number").max=step.rows?.length||0;
    byId("next-row").disabled=!step.rows||state.completedRows>=step.rows.length;
    if(step.rows){const row=step.rows[state.completedRows];byId("row-title").textContent=row?`Следующий: ряд ${row.row} · ${row.side} сторона`:`Все ${step.rows.length} рядов отмечены связанными`;
      byId("row-text").textContent=row?.text||"Проверь итоговый счёт и заверши шаг ниже.";
      byId("row-count").textContent=row?`От начала детали: ряд ${row.physicalRow}. Перед рядом ${row.beforeStitches} п.; после ${row.afterStitches} п.${row.halves?` Половина А: ${row.halves.A}, Б: ${row.halves.B}.`:""}`:"";rowTable(byId("row-table"),step.rows);}
    byId("fields").replaceChildren();for(const key of Object.keys(fields))delete fields[key];
    for(const field of step.fields){const label=document.createElement("label"),input=document.createElement(field.type==="select"?"select":"input");label.textContent=field.label;input.id=`polo-step-${field.key}`;
      if(field.type==="select"){const empty=document.createElement("option");empty.value="";empty.textContent="Выбери сторону";input.append(empty);for(const o of field.options){const option=document.createElement("option");option.value=o.value;option.textContent=o.label;input.append(option);}}
      else{input.type=field.type;if(field.type==="number"){input.min=field.min;input.max=field.max;input.step=field.integer?"1":"any";}}
      label.append(input);if(field.target!==undefined)p(label,`Ориентир ${planner.fmt(field.target)}; допустимое отклонение этого контроля ${planner.fmt(field.tolerance)}. Введи фактическое значение.`);
      fields[field.key]=input;byId("fields").append(label);
    }
    byId("note").value=state.note;byId("saved").textContent="Место хранится локально в этом проекте и браузере. Сохрани резервную копию из списка проектов для переноса.";
  }
  function payload(){return Object.fromEntries(Object.entries(fields).map(([key,input])=>[key,input.type==="checkbox"?input.checked:input.value]));}
  async function mutate(action){if(busy)return;busy=true;byId("error").hidden=true;
    for(const id of ["start","restart","next-row","save","complete","rewind"])byId(id).disabled=true;
    try{inspected=await action();render();}
    catch(e){error(e);}
    finally{busy=false;for(const id of ["start","save","complete","rewind"])byId(id).disabled=false;byId("restart").disabled=!byId("restart-consent").checked;const step=inspected?.plan?.steps[inspected?.state?.stepIndex];byId("next-row").disabled=!step?.rows||inspected.state.completedRows>=step.rows.length;}
  }
  async function save(rowOverride){const step=inspected.plan.steps[inspected.state.stepIndex];return domain.savePositionForProject(repository,projectId,step.id,rowOverride??Number(byId("row-number").value),byId("note").value,inspected.progress.revision);}
  byId("start").addEventListener("click",()=>mutate(()=>domain.startForProject(repository,projectId)));
  byId("restart-consent").addEventListener("change",()=>{byId("restart").disabled=busy||!byId("restart-consent").checked;});
  byId("restart").addEventListener("click",()=>{if(byId("restart-consent").checked)return mutate(()=>domain.startForProject(repository,projectId,inspected.progress.revision,true));});
  byId("next-row").addEventListener("click",()=>mutate(()=>save(inspected.state.completedRows+1)));
  byId("save").addEventListener("click",()=>mutate(()=>save()));
  byId("step-form").addEventListener("submit",event=>{event.preventDefault();const input=payload(),id=inspected.plan.steps[inspected.state.stepIndex].id;return mutate(async()=>{const saved=await save();inspected=saved;return domain.completeStepForProject(repository,projectId,id,input,saved.progress.revision);});});
  byId("rewind").addEventListener("click",()=>mutate(()=>domain.rewindForProject(repository,projectId,Number(byId("rewind-to").value),inspected.progress.revision)));
  init().catch(error);
})(typeof window!=="undefined"?window:globalThis);
