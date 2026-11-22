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
  function renderPhoto() {
    const area=byId("photo"), state=inspected?.state;
    area.hidden=true;
    if (!state?.photoControl || !inspected.current || state.status!=="active") return;
    const step=inspected.plan.steps[state.stepIndex], policy=root.YarnAIPoloCheckpoints;
    const points=policy.forStep(step,inspected.design,state.photoControl.mode,state.records);
    const point=points.find(p=>p.row===state.completedRows);
    if (!point) return;
    area.hidden=false;
    const reviews=state.photoControl.reviews.filter(r=>policy.matches(r,state,step,point));
    const review=reviews.at(-1);
    paragraphs(byId("photo-guide"),[point.risk,point.expected,...point.requirements]);
    const manual=point.allowManual || point.id.endsWith(".rib") ? point.manual :
      ({
        before_armhole:"Измерь гладь от резинки до спицы по центру детали.",
        before_cap:"Измерь длину от края манжеты до начала оката.",
        shape:"Измерь обе проймы гибкой лентой и сравни высоту плеч.",
        cap:"Сравни длину обеих половин оката от подмышки до метки плеча.",
        shoulders:"Сверь длину обоих плечевых швов от выреза до проймы.",
        side:"Сверь сторону набора с выбранной стороной верхней планки.",
        holes:"Пересчитай отверстия и вставь пробную пуговицу.",
        overlap:"Совмести основание и верхушки планок, измерь оба края разреза.",
        collar:"Сравни высоту концов воротника сантиметром.",
        placement:"Гибкой лентой сравни каждую половину оката с соответствующей частью проймы.",
        seams:"Проверь совмещение середины оката с плечевым швом и подмышечных точек.",
        garment:"Разложи поло и сравни длину рукавов и боковых швов сантиметром."
      }[point.id.split(".").at(-1)] || point.manual);
    const messages={photos_ready:"Фото сохранены в проекте. Для отправки нажми кнопку проверки.",
      automatic_unavailable:"Автоматическая проверка недоступна. Место сохранено. " + manual,
      delivery_unknown:"Ответ пока недоступен. Можно запросить результат этой же проверки.",
      submitting:"Ответ ещё не сохранён. Запроси результат этой же проверки.",
      verified_continue:"По фото всё совпадает. Можно продолжать.",self_confirmed:"Сохранена твоя ручная проверка.",
      correction_required:"Перед продолжением исправь отклонение и добавь новое фото.",
      more_evidence_required:"Нужен дополнительный снимок.",cannot_determine:"По этим фото нельзя определить уверенно. " + manual};
    paragraphs(byId("photo-result"),[...(review?[messages[review.status],
      ...review.response?.observations?.map(o=>o.finding)||[], ...review.response?.missing_evidence||[]]:[]),
      ...(review?.photos?.length?["Сохранено снимков в этой проверке: "+review.photos.length+"."]:[])]);
    const passed=policy.passed(review,state,step,point);
    byId("photo-files").disabled=passed;byId("photo-save").disabled=passed;
    byId("photo-submit").disabled=!review || !["photos_ready","automatic_unavailable","delivery_unknown","submitting"].includes(review.status);
    byId("photo-submit").textContent=["delivery_unknown","submitting"].includes(review?.status)?"Получить результат сохранённого запроса":"Отправить на фотопроверку";
    byId("photo-manual").hidden=!point.allowManual || !["automatic_unavailable","cannot_determine"].includes(review?.status) || reviews.some(r=>r.status==="correction_required");
    if (!passed) {byId("next-row").disabled=true;byId("complete").disabled=true;}
  }
  function render(){
    byId("error").hidden=true;
    byId("project-title").textContent=inspected.aggregate.project.title;
    byId("current").hidden=true;byId("finished").hidden=true;byId("start-panel").hidden=true;byId("restart-panel").hidden=true;byId("rewind-panel").hidden=true;
    if(inspected.problem){error(inspected.problem);try{planner.build(inspected.design,[]);byId("restart-panel").hidden=!inspected.state;}catch(_){} }
    const plan=inspected.plan;
    byId("gauge-source").hidden = !plan || inspected.design?.intake?.artifact?.gauge?.source !== "manufacturer";
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
    renderPhoto();
    byId("note").value=state.note;byId("saved").textContent="Место хранится локально в этом проекте и браузере. Сохрани резервную копию из списка проектов для переноса.";
  }
  function payload(){return Object.fromEntries(Object.entries(fields).map(([key,input])=>[key,input.type==="checkbox"?input.checked:input.value]));}
  async function mutate(action){if(busy)return;busy=true;byId("error").hidden=true;
    for(const id of ["start","restart","next-row","save","complete","rewind"])byId(id).disabled=true;
    try{inspected=await action();render();}
    catch(e){error(e);}
    finally{busy=false;for(const id of ["start","save","complete","rewind"])byId(id).disabled=false;byId("restart").disabled=!byId("restart-consent").checked;const step=inspected?.plan?.steps[inspected?.state?.stepIndex];byId("next-row").disabled=!step?.rows||inspected.state.completedRows>=step.rows.length;renderPhoto();}
  }
  async function save(rowOverride){const step=inspected.plan.steps[inspected.state.stepIndex];return domain.savePositionForProject(repository,projectId,step.id,rowOverride??Number(byId("row-number").value),byId("note").value,inspected.progress.revision);}
  byId("photo-save").addEventListener("click",()=>mutate(()=>domain.selectPhotos(repository,projectId,[...byId("photo-files").files],inspected.progress.revision)));
  byId("photo-submit").addEventListener("click",()=>mutate(()=>domain.submitPhotos(repository,projectId,inspected.progress.revision)));
  byId("photo-manual").addEventListener("click",()=>mutate(()=>domain.manualCheck(repository,projectId,inspected.progress.revision)));
  byId("start").addEventListener("click",()=>mutate(()=>domain.startForProject(repository,projectId,0,false,byId("mode").value)));
  byId("restart-consent").addEventListener("change",()=>{byId("restart").disabled=busy||!byId("restart-consent").checked;});
  byId("restart").addEventListener("click",()=>{if(byId("restart-consent").checked)return mutate(()=>domain.startForProject(repository,projectId,inspected.progress.revision,true,inspected.state.photoControl?.mode || "experienced"));});
  byId("next-row").addEventListener("click",()=>mutate(()=>save(inspected.state.completedRows+1)));
  byId("save").addEventListener("click",()=>mutate(()=>save()));
  byId("step-form").addEventListener("submit",event=>{event.preventDefault();const input=payload(),id=inspected.plan.steps[inspected.state.stepIndex].id;return mutate(async()=>{const saved=await save();inspected=saved;return domain.completeStepForProject(repository,projectId,id,input,saved.progress.revision);});});
  byId("rewind").addEventListener("click",()=>mutate(()=>domain.rewindForProject(repository,projectId,Number(byId("rewind-to").value),inspected.progress.revision)));
  init().catch(error);
})(typeof window!=="undefined"?window:globalThis);
