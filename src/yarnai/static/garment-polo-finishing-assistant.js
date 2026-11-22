"use strict";
(function initializeFinishingUI(root) {
  if(typeof document==="undefined") return;
  const byId=id=>document.getElementById(`polo-finishing-${id}`),panel=document.getElementById("polo-finishing"),domain=root.YarnAIGarmentSetInDesign;
  const groups=[
    ["Образец резинки",[
      ["mainFabricConfirmed","Основной образец выше — лицевая гладь из выбранной пряжи и числа нитей", "checkbox"],
      ["ribTreated","Образец резинки 1×1 обработан, высушен и измерен без растяжения", "checkbox"],
      ["ribStitches","Петли в измеренном участке резинки, шт."],["ribWidthCm","Ширина этого участка, см"],["ribRows","Ряды в измеренном участке резинки, шт."],["ribHeightCm","Высота этого участка, см"],["ribNeedleMm","Спицы для резинки, мм"]]],
    ["Расчётная плотность резинки 1×1",[
      ["ribStitchesPer10Cm","Петли резинки на 10 см"],["ribRowsPer10Cm","Ряды резинки на 10 см"]]],
    ["Твой выбор размеров отделки",[
      ["hemHeightCm","Высота резинки низа, см"],["cuffHeightCm","Высота манжеты, см"],["collarHeightCm","Высота отложного воротника, см"]]],
    ["Застёжка и проверенная пробная петля",[
      ["buttonCount","Количество пуговиц, шт."],["buttonDiameterCm","Диаметр настоящей пуговицы, см"],["buttonholeStitches","Сколько петель закрыто в проверенном отверстии, шт."],["buttonEndMarginCm","Отступ центров крайних пуговиц от концов планки, см"],
      ["buttonholeTested","Пуговица проходит в обработанную пробную петлю и удерживается застёгнутой", "checkbox"]]],
    ["Масса образцов и доступная пряжа",[
      ["mainMassGrams","Масса всего сухого образца глади, г"],["mainFullWidthCm","Полная ширина взвешенного образца глади, см"],["mainFullHeightCm","Полная высота взвешенного образца глади, см"],
      ["ribMassGrams","Масса всего сухого образца резинки, г"],["ribFullWidthCm","Полная ширина взвешенного образца резинки, см"],["ribFullHeightCm","Полная высота взвешенного образца резинки, см"],
      ["reservePercent","Выбранный запас на швы, хвосты и погрешность, %"],["availableGrams","Фактическая доступная пряжа без образцов, г"]]],
  ];
  const sections = new Map();
  const inputs={};let repository,projectId,inspected,busy=false,dirty=false;
  const f=n=>new Intl.NumberFormat("ru-RU",{maximumFractionDigits:2}).format(n);
  function p(parent,text){const e=document.createElement("p");e.textContent=text;parent.append(e);}
  for(const [title,fields] of groups){
    const section=document.createElement("section"),heading=document.createElement("h3"),grid=document.createElement("div");heading.textContent=title;grid.className="field-grid";section.append(heading);
    if(title==="Твой выбор размеров отделки") p(section,"Высоты и число пуговиц ниже — предложения. Измени их под свой замысел. Ширина и длина планки уже выбраны в форме поло.");
    if(title==="Масса образцов и доступная пряжа") p(section,"Взвесь сухой образец целиком, без спиц. Для площади укажи его полные размеры вместе с краями; они могут отличаться от участка, на котором считалась плотность. Доступная пряжа — та, что остаётся для изделия. Подставленный по этикетке запас нужно проверить.");
    for(const [key,label,type] of fields){const wrap=document.createElement("label"),input=document.createElement("input");input.id=`polo-finish-${key}`;input.type=type||"number";if(!type){input.step="any";input.min="0";}wrap.append(document.createTextNode(label),input);grid.append(wrap);inputs[key]=input;input.addEventListener("input",()=>{dirty=true;byId("result").hidden=true;byId("consent").checked=false;byId("status").textContent="Данные изменены. Заново рассчитай отделку перед подтверждением.";});}
    sections.set(title, section);
    if (title === "Расчётная плотность резинки 1×1") {
      p(section, "Задай плотность резинки отдельно. Можно принять числа основного полотна как расчётное предположение. Реальная резинка может стянуться сильнее.");
      const useLabel = document.createElement("button");
      useLabel.type = "button";
      useLabel.className = "button secondary";
      useLabel.textContent = "Принять плотность этикетки как ориентир для резинки";
      useLabel.addEventListener("click", () => {
        const label = inspected.intake.artifact.gauge.label;
        inputs.ribStitchesPer10Cm.value = label.stitchesPer10Cm;
        inputs.ribRowsPer10Cm.value = label.rowsPer10Cm;
        inputs.ribRowsPer10Cm.dispatchEvent(new Event("input"));
      });
      section.append(useLabel);
    }
    section.append(grid);byId("fields").append(section);
  }
  function hide(){panel.hidden=true;}
  function refresh(repo,id,value){
    repository=repo;projectId=id;inspected=value;
    const available=value?.current&&value.state.status==="confirmed";
    panel.hidden=!available;if(!available)return;
    const manufacturer = value.intake.artifact.gauge.source === "manufacturer";
    sections.get("Расчётная плотность резинки 1×1").hidden = !manufacturer;
    sections.get("Образец резинки").querySelector("h3").textContent = manufacturer ? "Спицы для отделки" : "Образец резинки";
    sections.get("Застёжка и проверенная пробная петля").querySelector("h3").textContent = manufacturer ? "Застёжка" : "Застёжка и проверенная пробная петля";
    for (const key of ["mainFabricConfirmed","ribTreated","ribStitches","ribWidthCm","ribRows","ribHeightCm","buttonholeStitches","buttonholeTested"]) inputs[key].parentElement.hidden = manufacturer;
    sections.get("Масса образцов и доступная пряжа").hidden = manufacturer;
    document.getElementById("measured-rib-help").hidden = manufacturer;
    document.getElementById("measured-hole-help").hidden = manufacturer;
    const yarn=value.intake.artifact.yarn;
    const values=value.state.finishing?.input||{ribNeedleMm:manufacturer ? value.intake.artifact.needles.primaryMm : "",hemHeightCm:4,cuffHeightCm:4,collarHeightCm:7,buttonCount:3,buttonEndMarginCm:1.5,reservePercent:15,availableGrams:yarn.quantityAvailable&&yarn.skeinMassGrams?yarn.quantityAvailable*yarn.skeinMassGrams:""};
    for(const [key,input] of Object.entries(inputs)) {if(input.type==="checkbox")input.checked=values[key]===true;else input.value=values[key]??"";}
    dirty=false;render();
  }
  function read(){return Object.fromEntries(Object.entries(inputs).map(([key,input])=>[key,input.type==="checkbox"?input.checked:input.value]));}
  function render(){
    const result=inspected.finishing,confirmed=inspected.state.finishing?.status==="confirmed";
    byId("result").hidden=!result;byId("consent").checked=false;byId("confirm").disabled=true;byId("confirm").hidden=!!result&&confirmed;byId("consent-label").hidden=byId("confirm").hidden;
    byId("status").textContent=inspected.finishingProblem?.userMessage||inspected.finishingProblem?.message||(result?(confirmed?"Расчёт отделки подтверждён и сохранён. Можно открыть пошаговый план.":"Отделка рассчитана и сохранена. Проверь размеры, запас и подтверди расчёт."):inspected.intake.artifact.gauge.source === "manufacturer" ? "Укажи расчётную плотность резинки и диаметр пуговицы. Размер отверстия будет рассчитан для проверки на планке." : "Нужны фактические данные образцов и пуговицы. Незаполненные поля не заменяются догадками.");
    byId("plan").hidden=!result||!confirmed;
    byId("plan").href=`/garment-polo-execution?project=${encodeURIComponent(projectId)}`;
    if(result&&confirmed)byId("status").textContent="Расчёт отделки подтверждён и сохранён. Можно открыть план с рядами и контрольными измерениями.";
    if(!result)return;
    const v=byId("numbers");v.replaceChildren();
    p(v,`Резинка 1×1: ${f(result.rib.stitchesPerCm)} п./см и ${f(result.rib.rowsPerCm)} р./см на спицах ${f(result.rib.needleMm)} мм. ${result.rib.source === "design_target" ? "Задана расчётная плотность резинки." : "Плотность взята из отдельного образца."}`);
    for(const [name,item] of [["Низ переда и спинки",result.hem],["Каждая манжета",result.cuff]]) p(v,`${name}: ${item.stitches} п., ${item.rows} р. Высота ${f(item.heightCm)} см, ширина без кромочных ${f(item.widthCm)} см. Переход к основному полотну: ${item.transition.from} → ${item.transition.to} п.`);
    p(v,`С учётом смены плотности: корпус ${f(result.body.achievedLengthCm)} см (${result.hem.rows} р. резинки + ${result.body.mainRows} р. глади), рукав ${f(result.sleeve.achievedLengthCm)} см (${result.cuff.rows} р. манжеты + ${result.sleeve.mainRows} р. глади, включая окат). Это уточнённые размеры; сантиметры резинки не считаются рядами глади.`);
    p(v,`Каждая из двух перекрывающихся планок: предварительно ${result.band.stitches} п. × ${result.band.rows} р.; ${f(result.band.lengthCm)} × ${f(result.band.widthCm)} см. На верхней планке ${result.band.holes.length} отверстия по ${result.input.buttonholeStitches} п. в ряду ${result.band.holeRow}, восстановление петель в ряду ${result.band.recastRow}. Центры от нижнего конца: ${result.band.holes.map(h=>f(h.centerCm)).join("; ")} см.`);
    p(v,`Отложной воротник: предварительно ${result.collar.stitches} п. × ${result.collar.rows} р., высота ${f(result.collar.heightCm)} см. Оценка края горловины с верхами планок ${f(result.collar.neckEdgeCm)} см. Фактический край нужно измерить после соединения плеч, затем уточнить набор.`);
    const y=result.yarn;
    const m=result.input;
    if (y.status !== "unknown") {
    p(v,`Оценка пряжи: основное полотно ${f(y.mainAreaCm2)} см² × (${f(m.mainMassGrams)} г ÷ ${f(m.mainFullWidthCm)} см ÷ ${f(m.mainFullHeightCm)} см) + резинки ${f(y.ribAreaCm2)} см² × (${f(m.ribMassGrams)} г ÷ ${f(m.ribFullWidthCm)} см ÷ ${f(m.ribFullHeightCm)} см) = ${f(y.baseGrams)} г. С выбранным запасом ${f(y.reservePercent)}%: ${y.requiredGrams} г${y.requiredMeters?`, около ${f(y.requiredMeters)} м по этикетке`:""}.`);
    p(v,y.status==="shortage"?`ПРЯЖИ НЕ ХВАТАЕТ ПО ОЦЕНКЕ: доступно ${f(y.availableGrams)} г, не хватает ${f(y.shortageGrams)} г. Начинать изделие с этим запасом нельзя.`:`Доступно ${f(y.availableGrams)} г — расчётный запас покрыт. Это оценка по образцам; фактический расход проверяется во время вязания.`);
    }
    byId("limitations").replaceChildren(...result.limitations.map(text=>{const e=document.createElement("li");e.textContent=text;return e;}));
  }
  async function mutate(action){if(busy||!inspected)return;busy=true;byId("calculate").disabled=true;byId("confirm").disabled=true;for(const input of Object.values(inputs))input.disabled=true;
    try{const result=await action();root.YarnAIGarmentSetInDesignUI.accept(result);}
    catch(error){byId("status").textContent=error.userMessage||error.message;byId("result").hidden=true;}
    finally{busy=false;byId("calculate").disabled=false;for(const input of Object.values(inputs))input.disabled=false;}
  }
  byId("calculate").addEventListener("click",()=>mutate(()=>domain.saveFinishingForProject(repository,projectId,read(),inspected.progress.revision)));
  byId("consent").addEventListener("change",()=>{byId("confirm").disabled=busy||dirty||!byId("consent").checked;});
  byId("confirm").addEventListener("click",()=>{if(!dirty&&byId("consent").checked)return mutate(()=>domain.confirmFinishingForProject(repository,projectId,inspected.finishing.fingerprint,inspected.progress.revision));});
  root.YarnAIGarmentFinishingUI=Object.freeze({refresh,hide});
})(typeof window!=="undefined"?window:globalThis);
