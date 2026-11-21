"use strict";

(function initializePoloPlan(root) {
  const VERSION="GARMENT_POLO_PLAN_V1";
  const fingerprint=value=>root.YarnAIGarmentSetInGeometry.fingerprint(value);
  const even=n=>2*Math.round(n/2);
  const fmt=n=>new Intl.NumberFormat("ru-RU",{maximumFractionDigits:2}).format(n);
  function fail(code,message){throw Object.assign(new Error(message),{code,userMessage:message});}
  function transitionText(from,to){
    if(from===to)return `Провяжи ${to} п. лицевыми.`;
    const difference=to-from,slots=difference<0?to-2:from-2;
    const changes=root.YarnAIGarmentSetInGeometry.spread(Math.abs(difference),slots);
    if(changes.some(n=>n>1))fail("PLAN_TRANSITION_INVALID","Переход плотности нельзя выполнить указанным способом за один ряд.");
    let period=changes.length;
    for(let p=1;p<=changes.length;p++)if(changes.length%p===0&&changes.every((n,i)=>n===changes[i%p])){period=p;break;}
    const chunks=[];let plain=0;
    for(const n of changes.slice(0,period)){
      if(!n){plain++;continue;}if(plain){chunks.push(`${plain} лиц.`);plain=0;}
      chunks.push(difference<0?"2 п. вместе лицевой":"из 1 п. вывязать 2 (за переднюю и заднюю стенки)");
    }
    if(plain)chunks.push(`${plain} лиц.`);
    const repeat=changes.length/period;
    return `1 лицевая кромочная; ${repeat>1?`повтори ${repeat} раз: `:""}${chunks.join(", ")}; 1 лицевая кромочная. Получится ${to} п.`;
  }
  function flatWork(row){return row%2?"лицевыми":"изнаночными";}
  function ribRows(count,rows,offset=0){return Array.from({length:rows},(_,i)=>({row:i+1,physicalRow:offset+i+1,side:(i+1)%2?"лицевая":"изнаночная",beforeStitches:count,afterStitches:count,
    text:i===0?`1 лицевая кромочная; повторяй 1 лицевую, 1 изнаночную до последней петли; последняя — лицевая кромочная. Всего ${count} п.`:`Обе кромочные провязывай лицевыми. Между ними вяжи по рисунку: видимую лицевую петлю лицевой, изнаночную — изнаночной. Всего ${count} п.`}));}
  function singleSection(before,events,startEdge,row){
    const bo=events.filter(e=>e.kind==="bind_off").reduce((n,e)=>{if(e.edge!==startEdge)fail("PLAN_EDGE_UNREACHABLE","Закрытие назначено у недоступного края.");return n+e.count;},0);
    const startDec=events.filter(e=>e.kind==="decrease"&&e.edge===startEdge).reduce((n,e)=>n+e.count,0);
    const endDec=events.filter(e=>e.kind==="decrease"&&e.edge!==startEdge).reduce((n,e)=>n+e.count,0);
    if(startDec>1||endDec>1)fail("PLAN_DECREASE_UNSUPPORTED","Одновременные убавки требуют отдельной проверки инструкции.");
    const after=before-bo-startDec-endDec;
    if(after<0||((startDec||endDec)&&before-bo<2+2*(startDec+endDec)))fail("PLAN_ROW_IMPOSSIBLE","В ряду недостаточно петель для кромочных и убавок после закрытия. Форму нужно пересмотреть.");
    if(before===0)return {after:0,text:"Эта половина уже закрыта."};
    if(after===0){if(bo!==before)fail("PLAN_LAST_DECREASE_INVALID","Нельзя убавить последнюю живую петлю.");return{after:0,text:`Закрой все оставшиеся ${before} п., протяни хвост нити через последнюю петлю.`};}
    const work=flatWork(row),parts=[];
    if(bo)parts.push(`В начале ряда закрой ${bo} п. Рабочая петля после закрытия уже провязана и считается первой кромочной`);
    if(startDec||endDec){
      if(!bo)parts.push("Провяжи первую кромочную лицевой");
      if(startDec)parts.push(`провяжи следующие 2 п. вместе ${row%2?"лицевой":"изнаночной"}`);
      parts.push(`вяжи ${work} до последних ${endDec?3:1} п.`);
      if(endDec)parts.push(`2 п. вместе ${row%2?"лицевой":"изнаночной"}`);
      parts.push("последняя кромочная — лицевая");
    }else parts.push(`${bo?"Остальные петли":"Все петли"} вяжи ${work}, последнюю кромочную — лицевой${bo?"":", первую кромочную тоже лицевой"}`);
    return{after,text:`${parts.join("; ")}. Останется ${after} п.`};
  }
  function bodyRows(g,f,front){
    const b=g.body,offset=f.body.geometryRowOffset,total=f.body.mainRows;
    const neck=front?b.frontNeck:b.backNeck;
    const splitRow=(front?b.placket.startRow:neck.startRow)-offset;
    const gap=front?b.placket.stitches:neck.additionalCenterBindOff;
    const events=[],adjustments=[];
    const add=(row,part,edge,kind,count)=>events.push({row,part,edge,kind,count});
    for(const event of b.armhole.events)for(const part of event.edge==="both"?["A","B"]:[event.edge==="right"?"A":"B"])add(event.row-offset,part,"outer",event.technique,event.count);
    for(const [i,n] of b.shoulder.bindOffGroups.entries()){add(b.shoulder.startRow-offset+2*i,"A","outer","bind_off",n);add(b.shoulder.startRow-offset+2*i+1,"B","outer","bind_off",n);}
    for(const [i,e] of neck.perSide.entries()){
      if(!front&&i===0)continue; // the central back-neck closure removes both halves
      for(const part of ["A","B"]){
        const original=e.row-offset;
        const row=part==="A"?original+(e.technique==="bind_off"?1:-1):original;
        if(row!==original)adjustments.push({feature:"neck",part,fromRow:original,toRow:row});
        add(row,part,"neck",e.technique,e.count);
      }
    }
    let A=b.panelStitches/2,B=A,split=false;const rows=[];
    for(let row=1;row<=total;row++){
      const before=A+B,ea=events.filter(e=>e.row===row&&e.part==="A"),eb=events.filter(e=>e.row===row&&e.part==="B");
      let text;
      if(row===1){text=`Перейди на основные спицы. ${transitionText(f.hem.stitches,b.panelStitches)}`;}
      else if(row===splitRow){
        if([...ea,...eb].some(e=>e.kind!=="bind_off"||e.edge!=="outer"))fail("PLAN_SPLIT_COLLISION","В ряду разделения возникло несовместимое формирование.");
        const start=row%2?"A":"B";
        if(start!=="A"||eb.length)fail("PLAN_SPLIT_SIDE","Разделение должно начинаться с лицевой стороны.");
        const bo=ea.reduce((n,e)=>n+e.count,0);A-=bo+gap/2;B-=gap/2;
        if(A<1||B<1)fail("PLAN_SPLIT_EMPTY","После разделения не осталось двух рабочих половин.");
        text=`${bo?`В начале закрой ${bo} п. Рабочая петля уже провязана. Затем провяжи ещё `:"Провяжи "}${A+1-(bo?1:0)} п. лицевыми, закрой следующие ${gap} п. по приёму закрытия середины. Рабочая петля после закрытия — первая петля половины Б; провяжи ещё ${B-1} п. лицевыми. Половина А: ${A} п., половина Б: ${B} п. Отметь их. Далее работай двумя клубками, не соединяя разрез нитью.`;
        split=true;
      }else if(!split){
        const all=[...ea,...eb].map(e=>({...e,edge:e.part==="A"?"right":"left"}));
        const result=singleSection(before,all,row%2?"right":"left",row);text=result.text;
        A-=ea.reduce((n,e)=>n+e.count,0);B-=eb.reduce((n,e)=>n+e.count,0);
        if(A+B!==result.after)fail("PLAN_BODY_BALANCE","Не сошёлся баланс ряда корпуса.");
      }else{
        const a=singleSection(A,ea,row%2?"outer":"neck",row),bb=singleSection(B,eb,row%2?"neck":"outer",row);
        A=a.after;B=bb.after;
        text=`${row===splitRow+1?"Присоедини второй клубок к внутреннему краю половины А. ":""}${row%2?`А: ${a.text} Затем Б: ${bb.text}`:`Б: ${bb.text} Затем А: ${a.text}`}`;
      }
      if(A<0||B<0)fail("PLAN_BODY_NEGATIVE","В ряду корпуса получено отрицательное число петель.");
      rows.push({row,physicalRow:f.hem.rows+row,side:row%2?"лицевая":"изнаночная",beforeStitches:row===1?f.hem.stitches:before,afterStitches:A+B,halves:split?{A,B}:null,events:[...ea,...eb],text});
    }
    if(A+B!==0)fail("PLAN_BODY_OPEN","После плеч остались незакрытые петли.");
    return {rows,adjustments,splitRow};
  }
  function sleeveRows(g,f){
    let live=g.sleeve.cuffStitchesAtMainGauge;const rows=[];
    for(let row=1;row<=f.sleeve.mainRows;row++){
      const before=live,capRow=row-f.sleeve.beforeCapRows;
      const events=g.sleeve.cap.events.filter(e=>e.row===capRow).map(e=>({...e,kind:e.technique}));
      let text;
      if(row===1)text=`Перейди на основные спицы. ${transitionText(f.cuff.stitches,live)}`;
      else if(f.sleeve.increaseRows.includes(row)){live+=2;text=`1 лицевая кромочная; из следующей петли вывяжи 2 за переднюю и заднюю стенки; лицевые до последних 2 п.; из предпоследней вывяжи 2; 1 лицевая кромочная. Получится ${live} п.`;}
      else{
        const normalized=events.flatMap(e=>e.edge==="both"?[{...e,edge:"right"},{...e,edge:"left"}]:[e]);
        const result=singleSection(live,normalized,row%2?"right":"left",row);live=result.after;text=result.text;
        if(capRow===1)text=`Начинается окат. ${text}`;
      }
      rows.push({row,physicalRow:f.cuff.rows+row,side:row%2?"лицевая":"изнаночная",beforeStitches:row===1?f.cuff.stitches:before,afterStitches:live,text,events});
    }
    if(live!==g.sleeve.cap.finalBindOff)fail("PLAN_CAP_BALANCE","Окат не заканчивается расчётным числом петель.");
    return rows;
  }
  function bandForLength(f,lengthCm){
    if(!Number.isFinite(lengthCm)||lengthCm<=0)fail("PLAN_EDGE_MEASUREMENT","Нужна измеренная длина края планки.");
    const gs=f.rib.stitchesPerCm,stitches=even(lengthCm*gs)+2,length=(stitches-2)/gs,i=f.input;
    const holes=Array.from({length:i.buttonCount},(_,n)=>{
      const target=i.buttonEndMarginCm+n*(length-2*i.buttonEndMarginCm)/(i.buttonCount-1);
      const first=Math.round(1.5+target*gs-(i.buttonholeStitches-1)/2),last=first+i.buttonholeStitches-1;
      return {first,last,count:i.buttonholeStitches,centerCm:((first+last)/2-1.5)/gs};
    });
    if(holes.some((h,n)=>h.first<3||h.last>stitches-2||(n&&(h.first<=holes[n-1].last+1||h.centerCm-holes[n-1].centerCm<=i.buttonDiameterCm))))fail("PLAN_BUTTON_EDGE_CONFLICT","Измеренный край не вмещает выбранные пуговицы и отверстия. Нужен пересмотр застёжки.");
    return{...f.band,stitches,lengthCm:length,measuredEdgeCm:lengthCm,holes};
  }
  function bandRows(b,withHoles){
    let live=b.stitches;const rows=[];
    for(let row=1;row<=b.rows;row++){
      const before=live,side=row%2?"изнаночная":"лицевая";
      let text=row===1?"Первая кромочная лицевая; далее чередуй 1 изнаночную и 1 лицевую до последней петли; последняя кромочная лицевая.":"Обе кромочные лицевые; остальные петли вяжи по рисунку резинки 1×1.";
      const holes=(row%2?b.holes.map(h=>({...h,first:b.stitches+1-h.last,last:b.stitches+1-h.first})):b.holes).sort((a,bb)=>a.first-bb.first);
      if(withHoles&&row===b.holeRow){
        const actions=[];let consumed=0;
        for(const h of holes){actions.push(`провяжи ${h.first-consumed} п. по рисунку, закрой ${h.count} п. по приёму закрытия середины`);consumed=h.last+1;}
        if(consumed<b.stitches)actions.push(`провяжи оставшиеся ${b.stitches-consumed} п. по рисунку`);
        live-=holes.reduce((n,h)=>n+h.count,0);text=`Отверстия. ${actions.join("; ")}. После каждого закрытия рабочая петля уже провязана. Останется ${live} п.`;
      }else if(withHoles&&row===b.recastRow){
        const actions=[];let position=0;
        for(const h of holes){actions.push(`провяжи ${h.first-1-position} п. по рисунку, над разрывом набери ${h.count} новых петель тем же способом, что в пробной петле`);position=h.last;}
        if(position<b.stitches)actions.push(`провяжи оставшиеся ${b.stitches-position} п. по рисунку`);
        live=b.stitches;text=`Восстановление отверстий. ${actions.join("; ")}. На спице снова ${live} п. В следующих рядах продолжи рисунок 1×1 и на новых петлях.`;
      }
      rows.push({row,physicalRow:row,side,beforeStitches:before,afterStitches:live,text});
    }
    if(live!==b.stitches)fail("PLAN_BAND_BALANCE","После отверстий не восстановлены петли планки.");
    return rows;
  }
  const yes=(key,label)=>({key,label,type:"checkbox",required:true});
  const measure=(key,label,target,tolerance)=>({key,label,type:"number",min:0.1,max:500,target,tolerance:tolerance??Math.max(0.5,target*0.03)});
  const count=(n)=>({key:"stitches",label:"Фактически на спице, п.",type:"number",min:0,max:2000,integer:true,target:n,tolerance:0});
  function build(inspected,records=[]){
    if(!inspected.current||inspected.state?.status!=="confirmed"||!inspected.finishing||inspected.state.finishing?.status!=="confirmed")fail("PLAN_SOURCES_REQUIRED","Сначала подтверди актуальную форму поло и расчёт отделки.");
    const g=inspected.geometry,f=inspected.finishing,a=inspected.intake.artifact;
    if(f.geometryFingerprint!==g.fingerprint)fail("PLAN_SOURCES_STALE","Отделка относится к другой форме поло.");
    const evidence=Object.fromEntries(records.map(r=>[r.stepId,r.input]));
    const back=bodyRows(g,f,false),front=bodyRows(g,f,true),sleeve=sleeveRows(g,f);
    const steps=[];
    const add=(id,title,text,fields=[],rows=null,extra={})=>steps.push({id,title,text:Array.isArray(text)?text:[text],fields,rows,...extra});
    const worked=yes("done","Этот шаг действительно выполнен; это моя отметка, а не автоматическая проверка изделия");
    add("prepare","Подготовь материалы и прочитай обозначения",[
      `Пряжа: ${a.yarn.name}; число нитей ${a.yarn.strandCount}. Основные спицы ${a.needles.primaryMm} мм, для резинки ${f.rib.needleMm} мм. По оценке нужно ${f.yarn.requiredGrams} г с запасом, доступно ${f.yarn.availableGrams} г. Подготовь ${f.input.buttonCount} проверенных пуговицы диаметром ${fmt(f.input.buttonDiameterCm)} см, иглу для пряжи, держатель петель, маркеры и сантиметр.`,
      "Все детали вяжутся плоско, с поворотом. Набор не считается рядом. Половина А — справа на столе при взгляде на лицевую сторону детали; половина Б — слева. С лицевой стороны работаем А→Б, с изнаночной Б→А. Это обозначения на столе, а не стороны тела.",
      "Основное полотно — лицевая гладь. Первую и последнюю кромочные провязывай лицевыми в каждом ряду, кроме прямо описанного закрытия. После разреза у каждой половины свой клубок. В коротких плечевых рядах без оставшегося полотна закрывай все петли.",
      "Закрытия у горловины разведены по доступным краям: отдельные действия отличаются от геометрического ориентира на один ряд. Это нормальная последовательность работы поворотными рядами; окончательные размеры проверяются после обработки деталей.",
      "Этот план — кандидат на проверку вязанием. Остановись при несоответствии счёта, размеров или посадки; отметка в приложении не исправляет полотно. Перед вязанием всей вещи убедись, что основной образец и пробная петля действительно проверены.",
    ],[{key:"upperBand",label:"На какой половине будет верхняя планка с отверстиями?",type:"select",options:[{value:"A",label:"А — справа при взгляде на перед снаружи"},{value:"B",label:"Б — слева при взгляде на перед снаружи"}]},worked],null,{stockRequired:true});
    const panelMeasure=(name,frontPanel)=>{
      const fields=[measure("widthCm","Ширина детали между будущими боковыми швами, см",g.body.achievedWidthCm),measure("lengthCm","Длина от низа до высшей точки плеча, см",f.body.achievedLengthCm),measure("armA","Длина проймы А вдоль линии шва, см",g.body.armhole.perimeterCm/2,Math.max(1,g.body.armhole.perimeterCm*0.05)),measure("armB","Длина проймы Б вдоль линии шва, см",g.body.armhole.perimeterCm/2,Math.max(1,g.body.armhole.perimeterCm*0.05))];
      if(frontPanel)fields.push(measure("slitA","Длина края разреза А, см",g.body.placket.rows/g.gauge.rowsPerCm),measure("slitB","Длина края разреза Б, см",g.body.placket.rows/g.gauge.rowsPerCm));
      add(`${name}_measure`,`${frontPanel?"Перед":"Спинка"}: обработай и измерь`,"Обработай деталь так же, как образец, по указаниям на этикетке пряжи; высуши горизонтально без растяжения ради расчётного размера. Измерь ширину без кромочных, длину и каждую пройму гибкой лентой по будущей линии шва. Это контроль размеров, а не гарантия посадки.",fields);
    };
    for(const [name,label,table] of [["back","Спинка",back],["front","Перед",front]]){
      add(`${name}_cast`,`${label}: набери петли`,`На спицы ${f.rib.needleMm} мм набери ${f.hem.stitches} п. удобным проверенным на образце способом. Не соединяй в круг. Отметь лицевую сторону маркером.`,[count(f.hem.stitches)]);
      add(`${name}_rib`,`${label}: резинка низа`,`Свяжи ${f.hem.rows} р. резинки 1×1. Высота после обработки около ${fmt(f.hem.heightCm)} см.`,[count(f.hem.stitches)],ribRows(f.hem.stitches,f.hem.rows));
      add(`${name}_main`,`${label}: основное полотно и формирование`,["Нумерация здесь начинается с первого ряда глади после резинки. Счётчик общего ряда включает резинку. Делай все действия текущего ряда, включая одновременное формирование плеча и горловины.","При закрытии середины сначала провязана первая петля будущего закрытия; затем закрывается указанное число петель. Последняя рабочая петля относится к следующей половине и уже провязана — не считай её второй раз. После разделения вяжи обе половины в указанном порядке, каждую своим клубком."],[count(0)],table.rows,{adjustments:table.adjustments});
      panelMeasure(name,name==="front");
    }
    for(const n of [1,2]){
      add(`sleeve${n}_cast`,`Рукав ${n}: набор`,`Набери ${f.cuff.stitches} п. на спицы ${f.rib.needleMm} мм. Вяжи плоско.`,[count(f.cuff.stitches)]);
      add(`sleeve${n}_rib`,`Рукав ${n}: манжета`,`Свяжи ${f.cuff.rows} р. резинки 1×1.`,[count(f.cuff.stitches)],ribRows(f.cuff.stitches,f.cuff.rows));
      add(`sleeve${n}_main`,`Рукав ${n}: расширение и окат`,`Перейди к глади. Окат начинается в ряду ${f.sleeve.beforeCapRows+1} основного полотна; его длина уже входит в полную длину рукава.`,[count(g.sleeve.cap.finalBindOff)],sleeve);
      add(`sleeve${n}_close`,`Рукав ${n}: закрой верх оката`,`Закрой все оставшиеся ${g.sleeve.cap.finalBindOff} п. без стягивания; протяни хвост через последнюю петлю. Оставь хвост для закрепления.`,[worked]);
      add(`sleeve${n}_measure`,`Рукав ${n}: обработай и измерь`,"Обработай и высуши как образец. Полная длина измеряется от нижнего края манжеты до вершины оката. Ширина под окатом между будущими швами станет обхватом рукава; измерь её на плоской детали, не удваивай. Длину края оката измерь гибкой лентой вдоль линии вшивания, включая его верх.",[measure("lengthCm","Полная длина рукава, см",f.sleeve.achievedLengthCm),measure("upperCm","Ширина под окатом без кромочных, см",(g.sleeve.upperStitches-2)/g.gauge.stitchesPerCm),measure("capCm","Длина всего края оката по линии шва, см",g.sleeve.cap.perimeterCm,Math.max(1,g.sleeve.cap.perimeterCm*0.05))]);
    }
    add("shoulders","Соедини плечи",["Разложи перед и спинку лицевой стороной вверх, плечевыми краями друг к другу. Плечо А переда соответствует плечу Б спинки, и наоборот. Совмести внешний край, ступеньки плечевого скоса и край горловины.",`Соедини по ${g.body.shoulder.stitchesEach} закрытых петель каждого плеча горизонтальным трикотажным швом: иглой попеременно подхватывай обе дужки петли под закрытым краем одной и другой детали. Сохраняй размер стежка; не стягивай. Хвосты пока не обрезай коротко.`],[worked]);
    add("neck_measure","Измерь соединённую горловину","Измерь будущую линию набора от верхнего конца разреза А вокруг спинки до верхнего конца разреза Б. Верхи планок пока не включай: их ещё нет. Не растягивай край.",[measure("neckCm","Длина края горловины без верхов планок, см",f.collar.neckEdgeCm-2*f.band.widthCm,Math.max(1,(f.collar.neckEdgeCm-2*f.band.widthCm)*0.1))]);
    const upper=evidence.prepare?.upperBand;
    const bandData=side=>evidence.front_measure?bandForLength(f,evidence.front_measure[`slit${side}`]):null;
    for(const which of ["lower","upper"]){
      const side=upper?(which==="upper"?upper:upper==="A"?"B":"A"):null,b=side?bandData(side):null,label=which==="upper"?"Верхняя планка с отверстиями":"Нижняя планка";
      add(`${which}_pickup`,`${label}: подними петли`,b?`На половине ${side} подними ${b.stitches} п. по измеренному краю ${fmt(b.measuredEdgeCm)} см на спицы ${f.rib.needleMm} мм, начиная снизу и заканчивая у горловины, с лицевой стороны. Раздели край и число петель на четыре части маркерами; поднимай равномерно, не делая двойных наборов из одного отверстия подряд. Для каждой петли вводи спицу под кромочную, захватывай рабочую нить и вытягивай петлю.`:"Точное число будет рассчитано после выбора верхней планки и измерения обработанного разреза.",b?[count(b.stitches)]:[],null,{requires:["prepare","front_measure"],derived:b});
      add(`${which}_rib`,`${label}: свяжи резинку`,b?`Первый ряд после поднятия петель — изнаночный, от горловины к низу. ${which==="upper"?"Отверстия выполняются по проверенному образцу. Их положения в таблице учитывают направление текущего ряда.":"Отверстий в этой планке нет."}`:"Расписание появится после измерения края.",b?[count(b.stitches)]:[],b?bandRows(b,which==="upper"):null,{requires:["prepare","front_measure"]});
      add(`${which}_close`,`${label}: закрой край`,"Закрой все петли по рисунку резинки без стягивания, тем же способом и натяжением, что на образце; хвост закрепи позже.",[worked]);
    }
    add("bands_measure","Закрепи планки и проверь застёжку",["Наложи верхнюю планку с отверстиями поверх нижней на всю ширину. Нижние торцы обеих планок пришей к закрытым петлям основания разреза. Расправь без перекоса.","Обработай края как образец. Измерь ширину каждой планки и проверь настоящую пуговицу во всех отверстиях. Пуговицы пока можно не пришивать."],[measure("upperWidthCm","Ширина верхней планки, см",f.band.widthCm),measure("lowerWidthCm","Ширина нижней планки, см",f.band.widthCm),yes("buttonFit","Пуговица проходит во все отверстия и удерживается; планки лежат ровно")]);
    const neckCm=evidence.neck_measure?.neckCm,bands=evidence.bands_measure;
    const collar=neckCm&&bands?{stitches:even((neckCm+bands.upperWidthCm+bands.lowerWidthCm)*f.rib.stitchesPerCm)+2,rows:f.collar.rows,edgeCm:neckCm+bands.upperWidthCm+bands.lowerWidthCm}:null;
    add("collar_pickup","Подними петли воротника",collar?`С изнаночной стороны подними ${collar.stitches} п. на спицы ${f.rib.needleMm} мм по краю длиной ${fmt(collar.edgeCm)} см: от свободного края верхней планки по её верху, вокруг горловины и по верху нижней планки до свободного края. Распредели петли равномерно по отмеченным четвертям края. Воротник будет отворачиваться наружу.`:"Число будет уточнено по измеренной горловине и двум обработанным планкам.",collar?[count(collar.stitches)]:[],null,{requires:["neck_measure","bands_measure"],derived:collar});
    add("collar_rib","Свяжи воротник",`Свяжи ${f.collar.rows} р. резинки 1×1, около ${fmt(f.collar.heightCm)} см. Не соединяй в круг.`,collar?[count(collar.stitches)]:[],collar?ribRows(collar.stitches,collar.rows):null,{requires:["neck_measure","bands_measure"]});
    add("collar_close","Закрой и отверни воротник","Закрой все петли по рисунку свободно. Обработай как образец, высуши, отверни воротник наружу. Не фиксируй горячим утюгом без разрешения этикетки пряжи.",[measure("heightCm","Высота воротника после обработки, см",f.collar.heightCm),yes("liesFlat","Воротник лежит ровно, его край не стягивает горловину")]);
    const fit=[];
    if(evidence.front_measure&&evidence.back_measure&&evidence.sleeve1_measure&&evidence.sleeve2_measure){
      for(const [n,frontSide,backSide] of [[1,"A","B"],[2,"B","A"]]){
        const arm=evidence.front_measure[`arm${frontSide}`]+evidence.back_measure[`arm${backSide}`],cap=evidence[`sleeve${n}_measure`].capCm;
        fit.push({sleeve:n,frontSide,backSide,armCm:arm,capCm:cap,easeCm:cap-arm});
      }
    }
    add("sleeve_fit","Сверь реальные края перед вшиванием",fit.length?fit.map(x=>`Рукав ${x.sleeve}: окат ${fmt(x.capCm)} см, пройма перед ${x.frontSide} + спинка ${x.backSide}: ${fmt(x.armCm)} см; разница ${fmt(x.easeCm)} см. Допускается неотрицательная разница не более ${fmt(g.design.capEaseCm+0.5)} см.`):"Проверка использует сохранённые измерения всех четырёх деталей.",[worked],null,{requires:["front_measure","back_measure","sleeve1_measure","sleeve2_measure"],seamFit:fit});
    add("attach_sleeves","Вшей оба рукава",["Разложи изделие, пока боковые и рукавные швы открыты. Рукав 1 приложи к пройме А переда + Б спинки; рукав 2 — наоборот. Совмести середину верхнего закрытия оката с плечевым швом, оба подмышечных закрытия — с нижними углами проймы.","Приметай или закрепи маркерами по четвертям. Небольшую подтверждённую разницу краёв равномерно распредели по верхней части оката, без складок; подмышечные закрытия соединяй один к одному. Сшей пряжей иглой, подхватывая крайние дужки/протяжки на линии шва поочерёдно с двух сторон. Если появляются складки или приходится растягивать пройму, остановись и проверь измерения, а не затягивай шов."],[worked]);
    add("side_seams","Сшей бока и рукава",["Сложи изделие по плечам и совмести перед со спинкой. С каждой стороны соедини боковой шов от низа до подмышки, затем шов рукава от манжеты до подмышки. Совмести резинки, начала пройм и точки прибавок.","На прямых вертикальных краях используй матрасный шов: лицевые стороны обращены к тебе; иглой подхватывай поперечную протяжку между кромочной и следующей петлёй попеременно с каждой стороны. Через несколько стежков мягко подтяни нить. Не захватывай дополнительные столбики: по одной кромочной с каждой стороны уже учтено в расчёте."],[worked]);
    add("buttons","Пришей пуговицы и закрепи нити",`Расположи верхнюю планку поверх нижней, совмести верх и низ. Через каждое из ${f.input.buttonCount} отверстий отметь центр на нижней планке. Пришей пуговицы в отмеченных местах несколькими проходами подходящей прочной нити, оставляя место для толщины планки. Проверь застёгивание. Все хвосты закрепи с изнанки на нескольких петлях в двух направлениях; не обрезай вплотную.`,[worked]);
    add("final","Обработай готовое поло и проверь примеркой",["Обработай изделие по этикетке той же пряжи, высуши горизонтально. Измерь без растяжения и примерь. Проверь свободу движений, плечи, рукава, воротник и застёжку. Если посадка не устраивает, не отмечай готовность — вернись к нужному измерению или расчёту.","Финальная отметка означает твоё сообщение о завершении и примерке. Программа не наблюдала вязание и не подтверждает посадку вместо тебя."],[measure("bustCm","Обхват готового поло, см",2*g.body.achievedWidthCm),measure("lengthCm","Длина готового поло, см",f.body.achievedLengthCm),yes("fitAccepted","После примерки посадка и свобода движений устраивают"),yes("finishAccepted","Оба рукава, все швы, воротник, планки, пуговицы и концы нитей закончены")]);
    for(const step of steps)step.fingerprint=fingerprint(step);
    const plan={version:VERSION,status:"candidate",physicalFitProven:false,source:{geometryFingerprint:g.fingerprint,finishingFingerprint:f.fingerprint},steps,
      guides:[{title:"Горизонтальный шов плеч — фото (английский)",url:"https://www.purlsoho.com/create/seaming-stockinette-stitch-stitches-to-stitches/"},{title:"Матрасный шов — фото (английский)",url:"https://www.purlsoho.com/create/mattress-stitch/"},{title:"Пробная петля закрытием и набором — фото (английский)",url:"https://www.norichanknits.com/tutorials/2024/3/6/bind-off-buttonhole"}]};
    // Version pins the dynamic measurement policies; row templates pin the compiled shape.
    plan.fingerprint=fingerprint({version:VERSION,source:plan.source,back:back.rows,front:front.rows,sleeve,band:bandRows(bandForLength(f,f.band.lengthCm),true),stepIds:steps.map(s=>s.id)});
    return plan;
  }
  function validateCompletion(inspected,plan,step,raw,completedRows){
    if(step.rows&&completedRows!==step.rows.length)fail("PLAN_ROWS_INCOMPLETE","Сначала сохрани число всех выполненных рядов этого шага.");
    const prior=raw&&typeof raw==="object"?raw:{};const input={};
    for(const field of step.fields){
      if(field.type==="checkbox"){if(prior[field.key]!==true)fail("PLAN_CONFIRM_REQUIRED",field.label);input[field.key]=true;continue;}
      if(field.type==="select"){if(!field.options.some(o=>o.value===prior[field.key]))fail("PLAN_CHOICE_REQUIRED",field.label);input[field.key]=prior[field.key];continue;}
      const v=prior[field.key],n=v===""||v===null||v===undefined||typeof v==="boolean"?NaN:Number(v);
      if(!Number.isFinite(n)||n<field.min||n>field.max||(field.integer&&!Number.isInteger(n)))fail("PLAN_MEASUREMENT_REQUIRED",`Укажи корректное значение: ${field.label}`);
      if(field.target!==undefined&&Math.abs(n-field.target)>field.tolerance+1e-9)fail("PLAN_MEASUREMENT_MISMATCH",`${field.label}: получено ${fmt(n)}, расчёт ${fmt(field.target)}, допустимое отклонение для этого контроля ${fmt(field.tolerance)}. Остановись, проверь сухую деталь и исходные данные. Подгонять запись под расчёт нельзя.`);
      input[field.key]=n;
    }
    if(step.stockRequired&&inspected.finishing.yarn.status==="shortage")fail("PLAN_YARN_SHORTAGE","По оценке пряжи не хватает. Обнови фактический запас и подтверди расчёт отделки.");
    if(step.seamFit?.some(s=>s.easeCm<0||s.easeCm>inspected.geometry.design.capEaseCm+0.5))fail("PLAN_SEAM_MISMATCH","Реальные края оката и проймы не согласованы. Вшивание заблокировано; перепроверь измерения и детали. Припуск нельзя убрать растяжением проймы.");
    return input;
  }
  const api={VERSION,fingerprint,fmt,even,fail,transitionText,ribRows,bodyRows,sleeveRows,bandForLength,bandRows,build,validateCompletion};
  root.YarnAIGarmentPoloPlan=api;
  if(typeof module!=="undefined"&&module.exports)module.exports=api;
})(typeof window!=="undefined"?window:globalThis);
