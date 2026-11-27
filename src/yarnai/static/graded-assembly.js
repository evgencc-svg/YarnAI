"use strict";

(function exposeAssembly(root) {
  const body = root.YarnAIBodyPanels || require("./graded-body-panels.js");
  const plan = root.YarnAIGarmentPoloPlan || require("./garment-polo-plan.js");
  const checkpoints = root.YarnAIPatternExecutionCheckpoint || require("./pattern-execution-checkpoint.js");

  function check(ok, message) {
    if (!ok) plan.fail("GRADED_ASSEMBLY_INVALID", message);
  }

  function read(reading, text) {
    check(reading.measuredPieces && reading.sections.map(s => s.heading).join("/") === "BACK/FRONT/SLEEVES/FINISHING"
      && reading.sections.every(s => s.vectors.every(v => v.selectionStatus === "selected")), "Проверь полноту разделов и выбор размера.");
    const header = text.split(/^\s*BACK\s*$/m)[0].replace(/\s+/g," ");
    const needles = [...header.matchAll(/(\d+(?:\.\d+)?)"\s*length circular needle, size (\d+) \(([\d.]+)\s*mm\)/gi)];
    check(needles.length === 1, "Нужны длина и размер круговых спиц из списка материалов.");
    const [, cord, us, mm] = needles[0];
    let rest = reading.sections.at(-1).projected.replace(/\s+/g," ").trim();
    function take(pattern, name) {
      const match = pattern.exec(rest);
      check(match, "Проверь в оригинале " + name + ".");
      rest = rest.slice(match[0].length).trim();
      return match.slice(1);
    }
    take(/^Sew shoulder seams\. Neckband: With RS facing, using circular needle, beginning at left shoulder seam, pick up and knit /i,"плечи, спицы и начало набора с лица");
    const [left, center, right, held, total] = take(/^(\d+) sts along left front neck edge, (\d+) sts across front neck edge, (\d+) sts along right front neck edge, then knit (\d+) sts from back holder[—–](\d+) sts\./i,"три участка набора и держатель");
    const [height] = take(/^Place marker and join for working in the round\. Work even in St st \(knit EVERY round\) for ([\d.¼½¾]+")\s*\. Bind off loosely knitwise\./i,"маркер, вязание по кругу и закрытие");
    take(/^Sew in sleeves\. Sew side and sleeve seams\. Weave in all ends and block as desired\.$/i,"порядок швов и окончательную обработку");
    const numbers = [left,center,right,held,total].map(Number);
    check(numbers.every(n => Number.isSafeInteger(n) && n > 0) && Number(mm)>0 && Number(cord)>0 && body.inches(height)>0, "Недопустимое число в отделке.");
    return {size:reading.selectedSize, needle:Number(mm), us:Number(us), cord:Number(cord), left:+left, center:+center,
      right:+right, held:+held, total:+total, height:body.inches(height)*2.54};
  }

  function build(s, panels, sleeves) {
    const {front,back} = panels;
    check(front.piece==="front" && back.piece==="back" && sleeves.length===2 && sleeves[0].piece==="left" && sleeves[1].piece==="right"
      && [front,back,...sleeves].every(p => p.selectedSize===s.size && p.events.at(-1)?.active===0), "Проверь готовность, размер и стороны четырёх деталей.");
    check(sleeves.every(p=>p.events.at(-1)?.section==="cap" && p.events.at(-1)?.kind==="bind_off") &&
      front.events.at(-1)?.kind==="finish","Перед или один из окатов не закончен.");
    const holder = back.upper.holder;
    const end = back.events.at(-1);
    check(holder && holder.destination==="back_neck" && end.kind==="hold" && end.destination===holder.destination
      && end.saved===holder.count && holder.count===s.held && front.events.at(-1).temporary===0, "Остаток живых петель горловины не совпадает с держателем спинки.");
    const picked = s.left+s.center+s.right;
    check(picked+holder.count===s.total, "Сумма поднятых и живых петель расходится с итогом издателя.");
    const steps=[];
    const field=(id,label,expected)=>({id,label,expected});
    const measure=(id,label)=>field(id,label+" (см)",null);
    function add(id,title,guide,fields=[],resources={}) {
      steps.push({id,title,guide,fields,...resources});
    }
    add("back","Проверь готовую спинку","Разложи спинку. Проверь плечевые скосы и обе проймы. Пересчитай живые петли спинки на держателе.",
      [field("holder","Петли на держателе",holder.count)]);
    add("front","Проверь готовый перед","Сверь размер переда со спинкой, форму выреза и оба плеча. На держателе переда и на рабочей спице не должно оставаться петель.");
    for (const side of ["left","right"]) {
      add("cap-"+side,side==="left"?"Проверь готовый левый рукав":"Проверь готовый правый рукав",
        "Проверь манжету, оба склона и закрытый верх оката. Отметь сторону изделия. Измерь обработанный рукав от набора до подмышки и от подмышки до вершины оката.",
        [measure("length","Длина до подмышки"),measure("cap","Высота оката")]);
    }
    for (const side of ["left","right"]) {
      const left=side==="left";
      add("shoulder-"+side,left?"Соедини левое плечо":"Соедини правое плечо",
        "Совмести плечи переда и спинки от горловины до проймы. При взгляде на лицо деталей это "+(left?"правый край переда и левый край спинки.":"левый край переда и правый край спинки.")+" Сверь длины до сшивания и проверь шов.",
        [measure("front","Плечо переда"),measure("back","Плечо спинки")],{edges:["front.shoulder."+side,"back.shoulder."+side]});
    }
    const needle="Круговые спицы "+s.needle+" мм (№ "+s.us+" США), длина "+s.cord+"″.";
    add("pickup","Подними петли по переду",needle+" Поверни изделие лицом к себе. От левого плечевого шва подними и провяжи лицевыми "+s.left+" п. вниз по левому краю переда, "+s.center+" п. по центру, "+s.right+" п. вверх по правому краю. На спице "+picked+" п.",
      [field("needle","Диаметр круговых спиц, мм",s.needle),field("left","Левый край, п.",s.left),field("center","Центр, п.",s.center),field("right","Правый край, п.",s.right)],{active:picked});
    add("holder","Провяжи петли спинки и замкни круг","Провяжи лицевыми "+holder.count+" п. с держателя спинки. На круговых спицах "+s.total+" п., держатель пуст. Поставь маркер и замкни круг у левого плечевого шва.",
      [field("total","Петель на круговых спицах",s.total)],{consume:holder.destination,active:s.total});
    add("neck","Свяжи и закрой горловину","Вяжи каждый круг лицевыми до "+s.height.toLocaleString("ru")+" см от набора. Число кругов определи по полотну. Свободно закрой все "+s.total+" п. лицевыми. Проверь высоту и форму края.",
      [field("height","Высота горловины, см",s.height)],{active:0});
    for (const side of ["left","right"]) {
      const word=side==="left"?"левый":"правый";
      add("place-"+side,"Приметай "+word+" рукав","Отметь середину закрытого верха оката и плечевой шов. Совмести подмышечные точки, переднюю и заднюю половины соответствующей проймы. Измерь четыре обработанных края гибкой лентой по линии шва. Проверь припосадку на намётке без складок и растяжения.",
        [measure("capFront","Окат от подмышки до середины, спереди"),measure("armFront","Пройма от подмышки до плеча, спереди"),
         measure("capBack","Окат от подмышки до середины, сзади"),measure("armBack","Пройма от подмышки до плеча, сзади")]);
      add("attach-"+side,"Втачай "+word+" рукав","После проверки намётки соедини окат с проймой этой стороны, совместив середину с плечом. Проверь обе половины шва.",
        [],{edges:["cap."+side,"armhole."+side]});
    }
    for (const side of ["left","right"]) {
      const word=side==="left"?"левый":"правый";
      add("side-"+side,"Выполни "+word+" боковой шов","Совмести низ и подмышку. Сверь длины боковых краёв переда и спинки.",
        [measure("front","Край переда"),measure("back","Край спинки")],{edges:["front.side."+side,"back.side."+side]});
      add("sleeve-"+side,"Выполни шов рукава ("+word+")","Совмести внешние края одной детали от манжеты до подмышки. Проверь совмещение манжеты и стык четырёх швов.",
        [measure("a","Первый продольный край"),measure("b","Второй продольный край")],{edges:["sleeve.a."+side,"sleeve.b."+side]});
    }
    add("finish","Спрячь концы нитей и обработай изделие по желанию","Расправь изделие. Измерь готовую окружность груди и длину от плеча до низа. Сфотографируй изделие целиком с сантиметровой лентой.",
      [measure("chest","Окружность груди"),measure("length","Длина изделия")]);
    return {size:s.size,held:holder.count,steps};
  }

  // Recover resource ownership from the validated prefix, never from a stored cursor.
  function inspect(model, key, saved, photos=[]) {
    const records=saved===undefined?[]:saved?.records;
    check(Array.isArray(records) && (saved===undefined || saved.key===key) && records.length<=model.steps.length,
      "Журнал не соответствует этому проекту, источнику или размеру.");
    if (saved!==undefined) {
      const {checksum,...payload}=saved;
      check(checksum===plan.fingerprint(payload),"Контрольная сумма сохранённого журнала не совпадает.");
      const step=model.steps[records.length];
      if (saved.waiting!==undefined) {
        check(step && saved.waiting===step.id && saved.draft && Object.entries(saved.draft).every(([id,value])=>
          step.fields.some(f=>f.id===id) && Number.isFinite(value) && value>0),"Черновик замеров относится к другой операции.");
      }
    }
    let held=model.held, active=0;
    const used=new Set();
    for (const [index,r] of records.entries()) {
      const step=model.steps[index];
      check(r?.id===step.id && r.operation===plan.fingerprint(step) && r.confirmed===true && r.values && typeof r.values==="object" &&
        Object.keys(r.values).length===step.fields.length, "Нарушена последовательность или отсутствует контрольная точка.");
      check(Array.isArray(r.photos) && r.photos.every(id=>photos.some(p=>p.photo_id===id && p.purpose===purpose(key,step.id) && !p.deleted_at)),
        "Сохранённый снимок контрольной точки недоступен.");
      for (const f of step.fields) {
        const value=r.values[f.id];
        check(Number.isFinite(value) && value>0,"Введи фактический замер или пересчёт: "+f.label+".");
        if (f.expected!==null) {
          const type=["height","needle"].includes(f.id)?"measurement":"stitch_count";
          const unit=f.id==="needle"?"мм":type==="measurement"?"см":"п.";
          const [spec]=checkpoints.buildObservationSpecs({checkpointId:step.id+"."+f.id,expectedValue:f.expected,unit},type);
          const verdict=checkpoints.validateObservations({immutableSourceSnapshot:{observationSpecs:[spec]},
            observations:[{observationId:spec.observationId,type,value:{value,unit:spec.unit}}]});
          check(!verdict.structural.length && verdict.complete && verdict.matchesExpected,"Сверь с оригиналом: "+f.label+".");
        }
      }
      for (const edge of step.edges || []) {
        check(!used.has(edge),"Этот край уже соединён.");
        used.add(edge);
      }
      if (step.consume) {
        check(step.consume==="back_neck" && held===model.held && held>0,"Держатель уже использован.");
        held=0;
      }
      if (step.active!==undefined) active=step.active;
    }
    return {records,held,active,used:[...used],next:model.steps[records.length] || null};
  }
  function purpose(key,id) { return "assembly."+plan.fingerprint(key)+"."+id; }
  function journal(payload) { return {...payload,checksum:plan.fingerprint(payload)}; }
  const api={read,build,inspect,purpose,journal};
  root.YarnAIGradedAssembly=api;
  if (typeof module!=="undefined") module.exports=api;
})(typeof window!=="undefined"?window:globalThis);
