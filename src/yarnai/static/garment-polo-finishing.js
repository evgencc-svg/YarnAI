"use strict";

(function initializeFinishing(root) {
  const VERSION = "GARMENT_POLO_FINISHING_V1";
  function fail(code, message) { throw Object.assign(new Error(message), { code, userMessage: message }); }
  function number(v, title, min, max, integer = false) {
    const n = v === "" || v === null || v === undefined || typeof v === "boolean" ? NaN : Number(v);
    if (!Number.isFinite(n) || n < min || n > max || (integer && !Number.isInteger(n))) fail("FINISH_INPUT_INVALID", `${title}: нужно ${integer ? "целое " : ""}число от ${min} до ${max}.`);
    return n;
  }
  const even = n => 2 * Math.round(n / 2);
  function normalize(v) {
    if (v.mainFabricConfirmed !== true) fail("MAIN_FABRIC_UNCONFIRMED", "Подтверди, что основной обработанный образец связан лицевой гладью из той же пряжи и в то же число нитей.");
    if (v.ribTreated !== true) fail("RIB_GAUGE_UNCONFIRMED", "Нужен обработанный и высушенный образец резинки 1×1, измеренный без растяжения.");
    if (v.buttonholeTested !== true) fail("BUTTONHOLE_UNTESTED", "Свяжи пробную петлю для своей пуговицы: она должна проходить через отверстие и удерживаться застёгнутой. Укажи проверенное число закрытых петель.");
    const rules = [
      ["ribStitches", "Петли в образце резинки", 4, 300, true], ["ribWidthCm", "Измеренная ширина резинки, см", 2, 50],
      ["ribRows", "Ряды в образце резинки", 4, 300, true], ["ribHeightCm", "Измеренная высота резинки, см", 2, 50],
      ["ribNeedleMm", "Спицы для резинки, мм", 1, 15], ["hemHeightCm", "Высота резинки низа, см", 1, 15],
      ["cuffHeightCm", "Высота манжеты, см", 1, 15], ["collarHeightCm", "Высота отложного воротника, см", 3, 12],
      ["buttonCount", "Число пуговиц", 2, 6, true], ["buttonDiameterCm", "Диаметр пуговицы, см", 0.5, 3],
      ["buttonholeStitches", "Петли проверенного отверстия", 1, 12, true], ["buttonEndMarginCm", "Отступ центров крайних пуговиц от концов планки, см", 0.5, 5],
      ["mainMassGrams", "Масса всего сухого образца глади, г", 0.1, 100], ["mainFullWidthCm", "Полная ширина образца глади, см", 3, 60], ["mainFullHeightCm", "Полная высота образца глади, см", 3, 60],
      ["ribMassGrams", "Масса всего сухого образца резинки, г", 0.1, 100], ["ribFullWidthCm", "Полная ширина образца резинки, см", 3, 60], ["ribFullHeightCm", "Полная высота образца резинки, см", 3, 60],
      ["reservePercent", "Выбранный запас пряжи, %", 5, 40], ["availableGrams", "Фактический доступный запас пряжи, г", 1, 10000],
    ];
    const out = Object.fromEntries(rules.map(([key,title,min,max,int]) => [key, number(v[key], title, min, max, int)]));
    return { ...out, mainFabricConfirmed: true, ribTreated: true, buttonholeTested: true };
  }
  function transition(from, to) {
    const difference = to - from;
    if (difference < 0 && -difference > Math.floor((from - 2) / 2)
      || difference > from - 3) fail("RIB_TRANSITION_TOO_LARGE", "Разница плотностей требует отдельного перехода в несколько рядов. Эта версия рассчитывает переход за один ряд и не подменяет твои измерения.");
    return { from, to, difference, technique: difference > 0 ? "make_one" : difference < 0 ? "knit_two_together" : "none" };
  }
  function rowArea(start, rows, events, gs, gr) {
    let live = start, stitchRows = 0;
    for (let row=1;row<=rows;row++) {
      const before=live;
      live += events.filter(e=>e.row===row).reduce((n,e)=>n+e.delta,0);
      if (live<0) fail("FINISH_AREA_BALANCE", "Формирование снимает больше петель, чем осталось на спице.");
      stitchRows+=(before+live)/2;
    }
    return { areaCm2: stitchRows/gs/gr, finalStitches: live };
  }
  function neckLength(neck, totalRows, gs, gr, gap) {
    const depth=(totalRows-neck.startRow+1)/gr;
    const horizontal=(neck.totalRemovedEach-neck.perSide[0].count)/gs;
    // Horizontal bottom plus the two sloped upper edges. The existing placket
    // gap is not counted here; its two band tops are added separately.
    return (neck.centerBindOff-gap)/gs+2*Math.hypot(horizontal,depth);
  }
  function build(g, artifact, raw) {
    const {fingerprint,...geometryPayload}=g;
    if(fingerprint!==root.YarnAIGarmentSetInGeometry.fingerprint(geometryPayload)
      ||artifact.fingerprint!==g.source.intakeFingerprint
      ||root.YarnAIManualCalculationIntake.artifactFingerprint(artifact)!==artifact.fingerprint) fail("FINISH_SOURCE_INVALID","Форма или исходные данные изменились. Открой актуальный расчёт.");
    const input=normalize(raw), gs=g.gauge.stitchesPerCm, gr=g.gauge.rowsPerCm;
    const rib={stitchesPerCm:input.ribStitches/input.ribWidthCm, rowsPerCm:input.ribRows/input.ribHeightCm, needleMm:input.ribNeedleMm, pattern:"rib_1x1", measured:"treated_dry_unstretched"};
    if(input.ribFullWidthCm<input.ribWidthCm || input.ribFullHeightCm<input.ribHeightCm
      || input.mainFullWidthCm<artifact.gauge.sourceMeasurement.widthCm || input.mainFullHeightCm<artifact.gauge.sourceMeasurement.heightCm) fail("SWATCH_AREA_CONFLICT", "Полные размеры взвешенного образца не могут быть меньше измеренного участка плотности.");
    const b=g.body,s=g.sleeve;
    const measurement=key=>artifact.targetSizing.finishedGarmentMeasurements.find(m=>m.kind===key)?.value;
    const hemRows=even(input.hemHeightCm*rib.rowsPerCm), cuffRows=even(input.cuffHeightCm*rib.rowsPerCm);
    if(hemRows<2||cuffRows<2) fail("RIB_TOO_SHORT","На резинку нужны минимум два ряда.");
    const hemHeight=hemRows/rib.rowsPerCm,cuffHeight=cuffRows/rib.rowsPerCm;
    const bodyMainRows=even((measurement("finished_body_length")-hemHeight)*gr), sleeveMainRows=even((measurement("finished_sleeve_length")-cuffHeight)*gr);
    const bodyOffset=b.bodyRows-bodyMainRows, sleeveBeforeCapRows=sleeveMainRows-s.cap.rows;
    if(b.armhole.startRow-bodyOffset<3 || b.placket.startRow-bodyOffset<3 || sleeveBeforeCapRows<4) fail("RIB_LENGTH_CONFLICT", "Резинка занимает место, нужное для основной детали. Проверь её высоту и полную длину изделия/рукава.");
    const hemStitches=even(b.achievedWidthCm*rib.stitchesPerCm)+2;
    const cuffStitches=even((s.cuffStitchesAtMainGauge-2)/gs*rib.stitchesPerCm)+2;
    const hem={rows:hemRows,stitches:hemStitches,heightCm:hemHeight,widthCm:(hemStitches-2)/rib.stitchesPerCm,transition:transition(hemStitches,b.panelStitches)};
    const cuff={rows:cuffRows,stitches:cuffStitches,heightCm:cuffHeight,widthCm:(cuffStitches-2)/rib.stitchesPerCm,transition:transition(cuffStitches,s.cuffStitchesAtMainGauge)};
    const slots=Math.floor((sleeveBeforeCapRows-2)/2);
    if(s.increasePairs>slots) fail("SLEEVE_INCREASE_SPACE", "После манжеты не хватает лицевых рядов для всех прибавок рукава.");
    const increaseRows=Array.from({length:s.increasePairs},(_,i)=>1+2*Math.floor((i+1)*slots/s.increasePairs));
    const placketLength=b.placket.rows/gr, placketWidth=b.placket.stitches/gs;
    const bandStitches=even(placketLength*rib.stitchesPerCm)+2, bandRows=even(placketWidth*rib.rowsPerCm);
    const bandLength=(bandStitches-2)/rib.stitchesPerCm,bandWidth=bandRows/rib.rowsPerCm;
    if(bandRows<4 || input.buttonDiameterCm>=bandWidth || 2*input.buttonEndMarginCm>=bandLength) fail("BUTTON_LAYOUT_INVALID", "Пуговица должна помещаться по ширине планки, а отступы — оставлять место между крайними пуговицами.");
    const centers=Array.from({length:input.buttonCount},(_,i)=>input.buttonEndMarginCm+i*(bandLength-2*input.buttonEndMarginCm)/(input.buttonCount-1));
    const holes=centers.map(cm=>{const first=Math.round(1.5+cm*rib.stitchesPerCm-(input.buttonholeStitches-1)/2),last=first+input.buttonholeStitches-1;return{firstStitch:first,count:input.buttonholeStitches,lastStitch:last,targetCenterCm:cm,centerCm:((first+last)/2-1.5)/rib.stitchesPerCm};});
    for(let i=0;i<holes.length;i++) if(holes[i].firstStitch<3 || holes[i].lastStitch>bandStitches-2 || (i&&(holes[i].firstStitch<=holes[i-1].lastStitch+1||holes[i].centerCm-holes[i-1].centerCm<=input.buttonDiameterCm))) fail("BUTTONHOLES_OVERLAP","Отверстия или пуговицы слишком близки к краю или друг к другу. Проверь размер пробной петли, число пуговиц и отступы.");
    const holeRow=Math.max(2,Math.floor(bandRows/2));
    const neckEdgeCm=neckLength(b.frontNeck,b.bodyRows,gs,gr,b.placket.stitches)+neckLength(b.backNeck,b.bodyRows,gs,gr,0)+2*bandWidth;
    const collarStitches=even(neckEdgeCm*rib.stitchesPerCm)+2,collarRows=even(input.collarHeightCm*rib.rowsPerCm);
    const collar={stitches:collarStitches,rows:collarRows,heightCm:collarRows/rib.rowsPerCm,neckEdgeCm,achievedLengthCm:(collarStitches-2)/rib.stitchesPerCm,provisional:true};
    const band={stitches:bandStitches,rows:bandRows,lengthCm:bandLength,widthCm:bandWidth,holeRow,recastRow:holeRow+1,holes,provisionalPickup:true};
    const areaBody=front=>{
      const events=b.armhole.events.map(e=>({row:e.row-bodyOffset,delta:-e.count*(e.edge==="both"?2:1)}));
      const neck=front?b.frontNeck:b.backNeck;
      if(front) events.push({row:b.placket.startRow-bodyOffset,delta:-b.placket.stitches});
      events.push(...neck.perSide.map(e=>({row:e.row-bodyOffset,delta:-2*e.count})));
      events.push(...b.shoulder.bindOffGroups.map((n,i)=>({row:b.shoulder.startRow-bodyOffset+2*i,delta:-2*n})));
      return rowArea(b.panelStitches,bodyMainRows,events,gs,gr);
    };
    const backArea=areaBody(false),frontArea=areaBody(true);
    const sleeveEvents=increaseRows.map(row=>({row,delta:2})).concat(s.cap.events.map(e=>({row:sleeveBeforeCapRows+e.row,delta:-e.count*(e.edge==="both"?2:1)})));
    const sleeveArea=rowArea(s.cuffStitchesAtMainGauge,sleeveMainRows,sleeveEvents,gs,gr);
    if(backArea.finalStitches!==0||frontArea.finalStitches!==0||sleeveArea.finalStitches!==s.cap.finalBindOff) fail("FINISH_BALANCE_INVALID","После расчёта отделки не сошёлся баланс основных деталей.");
    const mainArea=backArea.areaCm2+frontArea.areaCm2+2*sleeveArea.areaCm2;
    const ribArea=(2*hemStitches*hemRows+2*cuffStitches*cuffRows+2*bandStitches*bandRows+collarStitches*collarRows)/rib.stitchesPerCm/rib.rowsPerCm;
    const mainMassPerCm2=input.mainMassGrams/(input.mainFullWidthCm*input.mainFullHeightCm),ribMassPerCm2=input.ribMassGrams/(input.ribFullWidthCm*input.ribFullHeightCm);
    const baseMass=mainArea*mainMassPerCm2+ribArea*ribMassPerCm2;
    const requiredGrams=Math.ceil(baseMass*(1+input.reservePercent/100));
    const yarn={mainAreaCm2:mainArea,ribAreaCm2:ribArea,mainMassPerCm2,ribMassPerCm2,baseGrams:baseMass,reservePercent:input.reservePercent,requiredGrams,availableGrams:input.availableGrams,shortageGrams:Math.max(0,requiredGrams-input.availableGrams),status:input.availableGrams>=requiredGrams?"estimated_enough":"shortage",approximate:true};
    if(artifact.yarn.skeinMassGrams>0&&artifact.yarn.lengthMeters>0){yarn.requiredMeters=requiredGrams*artifact.yarn.lengthMeters/artifact.yarn.skeinMassGrams;yarn.skeins=Math.ceil(requiredGrams/artifact.yarn.skeinMassGrams);}
    const result={version:VERSION,geometryFingerprint:g.fingerprint,input,rib,hem,cuff,band,collar,yarn,
      body:{mainRows:bodyMainRows,geometryRowOffset:bodyOffset,totalPhysicalRows:hemRows+bodyMainRows,achievedLengthCm:hemHeight+bodyMainRows/gr},
      sleeve:{mainRows:sleeveMainRows,beforeCapRows:sleeveBeforeCapRows,increaseRows,totalPhysicalRows:cuffRows+sleeveMainRows,achievedLengthCm:cuffHeight+sleeveMainRows/gr},
      status:"finishing_review",executable:false,
      limitations:["Плотность отделки относится к резинке 1×1 из той же пряжи и числа нитей. Другой узор требует нового расчёта.","Набор вдоль горловины и разреза предварительный: после обработки деталей нужно измерить реальные края и уточнить набор перед выполнением отделки.","Расход оценён по площади деталей и массе сухих образцов. Запас — выбранная прибавка, а не гарантия; швы и хвосты входят в запас.","Сначала требуется полный план с порядком формирования и контрольными измерениями; этот экран не заменяет инструкцию."]};
    result.fingerprint=root.YarnAIGarmentSetInGeometry.fingerprint(result);
    return result;
  }
  root.YarnAIGarmentPoloFinishing=Object.freeze({VERSION,normalize,build,transition,rowArea});
  if(typeof module!=="undefined"&&module.exports) module.exports=root.YarnAIGarmentPoloFinishing;
})(typeof window!=="undefined"?window:globalThis);
