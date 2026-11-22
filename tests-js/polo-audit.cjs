"use strict";

const assert = require("node:assert/strict");
const {test} = require("node:test");

// Decimal cm in these fixtures are integers or halves. Compare candidate lattice
// points with the original ratio before division, including exact upward ties.
function nearest(cm, numerator, denominator, step = 2) {
  const lower = step * Math.floor(cm * numerator / denominator / step);
  return 2 * cm * numerator >= (2 * lower + step) * denominator ? lower + step : lower;
}
function near(a, b) { assert.ok(Math.abs(a - b) < 1e-8, a + " versus " + b); }
function transition(text, before) {
  if (!text.includes("кромочная;")) {
    assert.equal(Number(text.match(/Провяжи (\d+) п/)[1]), before);
    return before;
  }
  const times = Number(text.match(/повтори (\d+) раз/)?.[1] ?? 1);
  const pattern = text.split(";")[1].replace(/^.*раз: /, "");
  let read = 0, made = 0;
  for (const operation of pattern.trim().split(", ")) {
    if (operation.startsWith("2 п. вместе")) { read += 2; made++; }
    else if (operation.startsWith("из 1 п.")) { read++; made += 2; }
    else { const n = Number(operation.match(/^(\d+) лиц\./)[1]); read += n; made += n; }
  }
  assert.equal(2 + times * read, before);
  return 2 + times * made;
}
function work(text, live) {
  if (text.includes("уже закрыта")) { assert.equal(live, 0); return 0; }
  const closeAll = text.match(/Закрой все оставшиеся (\d+) п/);
  if (closeAll) { assert.equal(+closeAll[1], live); return 0; }
  const bound = Number(text.match(/В начале ряда закрой (\d+) п/)?.[1] ?? 0);
  const decreases = [...text.matchAll(/2 п\. вместе/g)].length;
  if (bound) assert.ok(live > bound); // one worked loop survives a partial bind-off
  if (decreases) assert.ok(live - bound >= 2 + 2 * decreases);
  return live - bound - decreases;
}
function replay(step, cast, target, offset, isSleeve) {
  let live = cast, halves;
  for (const [i, line] of step.rows.entries()) {
    assert.equal(line.beforeStitches, live);
    assert.equal(line.physicalRow, offset + i + 1);
    assert.equal(line.side, (offset + i) % 2 ? "изнаночная" : "лицевая");
    const t = line.text;
    if (!i) live = transition(t, live);
    else if (t.includes("по приёму закрытия середины")) {
      assert.equal(line.side, "лицевая");
      const bound = Number(t.match(/В начале закрой (\d+)/)?.[1] ?? 0);
      const first = Number(t.match(/(?:Провяжи |провяжи ещё )(\d+) п/)[1]);
      const gap = Number(t.match(/закрой следующие (\d+) п/)[1]);
      const tail = Number(t.match(/половины Б; провяжи ещё (\d+) п/)[1]);
      // One loop is already on the working needle before each chain bind-off.
      assert.equal(bound + (bound ? 1 : 0) + first + gap + tail, live);
      halves = {A: first + (bound ? 1 : 0) - 1, B: 1 + tail};
      live = halves.A + halves.B;
    } else if (halves) {
      const parts = [...t.matchAll(/([АБ]): (.*?)(?= Затем [АБ]:|$)/g)];
      assert.equal(parts.length, 2);
      assert.equal(parts[0][1], i % 2 ? "Б" : "А");
      for (const [,part, action] of parts) {
        const key = part === "А" ? "A" : "B";
        halves[key] = work(action, halves[key]);
      }
      live = halves.A + halves.B;
    } else if (t.includes("из предпоследней вывяжи 2")) {
      assert.equal(line.side, "лицевая");
      assert.ok(isSleeve && live >= 4); live += 2;
    } else live = work(t, live);
    assert.equal(line.afterStitches, live);
    if (halves) assert.deepEqual(line.halves, halves);
    for (const e of line.events ?? []) {
      if (e.kind !== "bind_off") continue;
      const right = e.part ? (e.part === "A") === (e.edge === "outer") : e.edge === "right";
      assert.equal(right, line.side === "лицевая");
    }
  }
  assert.equal(live, target);
}
function bandCheck(rows, stitches, holes, startsAtBottom) {
  let live = Array.from({length:stitches}, (_, i) => i + 1);
  for (const [index, line] of rows.entries()) {
    assert.equal(line.side, index % 2 ? "лицевая" : "изнаночная");
    assert.equal(line.beforeStitches, live.length);
    const ascending = Boolean(index % 2) === startsAtBottom;
    if (!ascending) live.reverse();
    const output = [];
    if (line.text.startsWith("Отверстия.") || line.text.startsWith("Восстановление отверстий.")) {
      for (const m of line.text.matchAll(/(провяжи (?:оставшиеся )?|закрой |набери )(\d+)/gi)) {
        const n = +m[2];
        if (m[1].toLowerCase().startsWith("провяжи")) {
          assert.ok(live.length >= n); output.push(...live.splice(0,n));
        } else if (m[1] === "закрой ") {
          assert.ok(output.length && live.length >= n);
          output.pop(); live.splice(0,n-1); output.push(live.shift());
        } else output.push(...Array(n).fill(null));
      }
      assert.equal(live.length, 0);
      live = output;
    }
    if (!ascending) live.reverse();
    if (line.text.startsWith("Отверстия.")) {
      const missing = Array.from({length:stitches},(_,i)=>i+1).filter(n=>!live.includes(n));
      assert.deepEqual(missing, holes.flatMap(h=>Array.from({length:h.count},(_,i)=>h.first+i)));
    }
    if (line.text.startsWith("Восстановление отверстий.")) {
      live = live.map((n,i)=>{ if(n!==null) assert.equal(n,i+1); return i+1; });
    }
    assert.equal(live.length, line.afterStitches);
  }
  assert.equal(live.length, stitches);
}

// Check the OUTLINE of the pieces as well as the ledger. A wrong schedule can
// still close every stitch. Compare cumulative shaping with the cm targets.
function panelOutline(rows, front, specification) {
  const {panel, shoulderWidth, neck, slit, firstArm, firstShoulder, firstNeck,
    firstSlit, shoulderRows, shoulderStitches, offset}=specification;
  const sides={A:{arm:0,shoulder:0,neck:0},B:{arm:0,shoulder:0,neck:0}};
  const indent=(panel-shoulderWidth)/2, ledge=Math.floor(indent/2);
  const center=front ? slit : 2*Math.max(1,Math.floor(neck/4));
  let split=false;
  for (const line of rows) {
    const r=line.row+offset;
    for(const event of line.events) {
      const side=sides[event.part];
      if(event.edge==="neck") {
        assert.ok(r>=firstNeck-1);
        side.neck+=event.count;
      } else if(r>=firstShoulder) side.shoulder+=event.count;
      else side.arm+=event.count;
    }
    if(r===(front?firstSlit:firstNeck)) {
      for(const side of Object.values(sides)) side.neck+=center/2;
      split=true;
    }
    let live=0;
    for(const [name,side] of Object.entries(sides)) {
      const delay=Number(name==="B");
      const curve=Math.max(0,Math.min(indent-ledge,Math.floor((r-firstArm-1)/2)));
      assert.equal(side.arm,(r>=firstArm+delay?ledge:0)+curve);
      const groups=Math.max(0,Math.min(shoulderRows/2,1+Math.floor((r-firstShoulder-delay)/2)));
      assert.equal(side.shoulder,Math.floor(2*groups*shoulderStitches/shoulderRows));
      const remain=panel/2-side.arm-side.shoulder-side.neck;
      assert.ok(remain>=0);
      if(split) assert.equal(line.halves[name],remain);
      live+=remain;
    }
    assert.equal(line.afterStitches,live);
  }
  assert.equal(sides.A.neck+sides.B.neck,neck);
}

module.exports = ({seed,intake,validation,preview,geometry,finishingDomain,poloPlan,finishingFixture}) => {
  test("audit: a partial shoulder bind-off can leave exactly the already worked edge stitch",()=>{
    const g={body:{panelStitches:8,armhole:{events:[]},shoulder:{startRow:5,bindOffGroups:[2,1]},
      backNeck:{startRow:3,additionalCenterBindOff:2,perSide:[{row:3,count:1,technique:"bind_off"}]}}};
    const f={body:{geometryRowOffset:0,mainRows:8},hem:{stitches:8,rows:2}};
    const step=poloPlan.bodyRows(g,f,false);
    assert.match(step.rows[4].text,/закрой 2 п\. Единственная оставшаяся петля уже провязана/);
    replay(step,8,0,2,false);
  });
  test("audit: every workable one-row rib transition reads exactly the old stitches", () => {
    for (let from=4; from<=60; from+=2) for (let to=4; to<=114; to+=2) {
      const fits = to-from <= from-2 && 2*(from-to) <= from-2;
      if (!fits) assert.throws(()=>finishingDomain.transition(from,to), {code:"RIB_TRANSITION_TOO_LARGE"});
      else {
        finishingDomain.transition(from,to);
        assert.equal(transition(poloPlan.transitionText(from,to),from),to);
      }
    }
  });

  test("audit: opening and recasting one to four stitches for two to six buttons on either side",()=>{
    for(let buttons=2;buttons<=6;buttons++) for(let hole=1;hole<=4;hole++){
      const height=4+2*hole, at=height/2;
      const f={rib:{stitchesPerCm:2.5},input:{buttonCount:buttons,buttonEndMarginCm:2,
        buttonholeStitches:hole,buttonDiameterCm:1.5},band:{rows:height,holeRow:at,recastRow:at+1}};
      const band=poloPlan.bandForLength(f,24.5);
      assert.equal(band.stitches,nearest(24.5,25,10)+2);
      for(const side of ["A","B"]) {
        const rows=poloPlan.bandRows(band,true,false,side);
        assert.equal(rows[at-1].afterStitches,band.stitches-buttons*hole);
        assert.equal(rows[at].afterStitches,band.stitches);
        bandCheck(rows,band.stitches,band.holes,side==="B");
      }
    }
  });

  async function source(label, variant) {
    const {repo,project} = await seed("option:set-in",true,label,variant);
    const id=project.project_id;
    await validation.validateForProject(repo,id);
    const {state}=await validation.confirmForProject(repo,id);
    const {artifact}=await intake.ensureForProject(repo,id);
    return {state,artifact};
  }
  test("audit: exact decimal midpoint in the preliminary width rounds upward",async()=>{
    const {state,artifact}=await source({stitchesPer10Cm:46,rowsPer10Cm:30,recommendedNeedleMm:3},
      {measurements:{finished_neck_width:25}});
    assert.equal(preview.build(state,artifact).rows.find(r=>r.key==="finished_neck_width").value,116);
  });

  for (const [name,measurements,expected] of [
    ["straight sleeve",{finished_cuff_circumference:34},null],
    ["short sleeve",{finished_sleeve_length:10},"SLEEVE_TOO_SHORT"],
    ["shallow armhole",{finished_armhole_depth:5},"ARMHOLE_TOO_SHALLOW"],
    ["narrow neck",{finished_neck_width:3},"PLACKET_INCOMPATIBLE"],
  ]) test("audit: "+name,async()=>{
    const {state,artifact}=await source({stitchesPer10Cm:20,rowsPer10Cm:28,recommendedNeedleMm:4},{measurements});
    const make=()=>geometry.build(state,artifact,geometry.proposals(state.confirmedSnapshot));
    if(expected){assert.throws(make,{code:expected});return;}
    const g=make();
    assert.equal(g.sleeve.increasePairs,0);
    const f=finishingDomain.build(g,artifact,{...finishingFixture(),ribStitchesPer10Cm:20,ribRowsPer10Cm:28});
    assert.deepEqual(f.sleeve.increaseRows,[]);
    replay({rows:poloPlan.sleeveRows(g,f)},f.cuff.stitches,g.sleeve.cap.finalBindOff,f.cuff.rows,true);
  });

  test("audit: coarse gauge must leave live stitches for the cap-top bind-off",async()=>{
    const {state,artifact}=await source({stitchesPer10Cm:3,rowsPer10Cm:8,recommendedNeedleMm:12},
      {needle:12,measurements:{finished_bust_circumference:120,finished_armhole_depth:22,
        finished_upper_arm_circumference:30,finished_neck_width:20}});
    const d={...geometry.proposals(state.confirmedSnapshot),shoulderWidthCm:40,placketWidthCm:4,backNeckDepthCm:5,capTopWidthCm:3};
    assert.throws(()=>geometry.build(state,artifact,d),{code:"CAP_TOP_TOO_NARROW"});
  });

  test("audit: the planned pickup must fit along the available slit rows",async()=>{
    const {state,artifact}=await source({stitchesPer10Cm:20,rowsPer10Cm:20,recommendedNeedleMm:4},{});
    const g=geometry.build(state,artifact,geometry.proposals(state.confirmedSnapshot));
    const raw={...finishingFixture(),ribStitchesPer10Cm:40,ribRowsPer10Cm:30};
    const f=finishingDomain.build(g,artifact,raw);
    assert.equal(f.band.stitches,50);
    assert.equal(g.body.placket.rows,24);
    const inspected={current:true,state:{status:"confirmed",finishing:{status:"confirmed"}},geometry:g,finishing:f,intake:{artifact}};
    assert.throws(()=>poloPlan.build(inspected),{code:"PLAN_PICKUP_TOO_DENSE"});
  });

  for(let family=0;family<12;family++) test("audit: complete row and seam replay, family "+family,async()=>{
    const labelMode=family%3!==0, index=family%4;
    const stitches=[18,20,22,24][index], rows=[26,28,30,32][index];
    const label=labelMode?{stitchesPer10Cm:stitches,rowsPer10Cm:rows,recommendedNeedleMm:4}:null;
    const sx=labelMode?stitches:23, dx=labelMode?10:12.5, sy=labelMode?rows:31, dy=labelMode?10:14;
    const width=[52,54,56,58][index], length=60+index, sleeveLength=54+2*index;
    const armDepth=23+index, neckWidth=17+index, upper=32+2*index, cuff=16+index;
    const m={finished_bust_circumference:2*width,finished_body_length:length,finished_sleeve_length:sleeveLength,
      finished_armhole_depth:armDepth,finished_neck_width:neckWidth,finished_upper_arm_circumference:upper,
      finished_cuff_circumference:cuff,finished_front_neck_depth:8+index};
    const {state,artifact}=await source(label,{needle:3+family/4,measurements:m});
    const design={...geometry.proposals(state.confirmedSnapshot),shoulderWidthCm:width-12,
      placketLengthCm:12+index,backNeckDepthCm:2+index/2};
    if (labelMode && index===0) {
      // Enumerate every allowed three-zone schedule independently, including odd
      // heights before filtering. This fixture has no contour in the seam window.
      const ns=cm=>nearest(cm,sx,dx), nr=cm=>nearest(cm,sy,dy);
      const indent=(ns(width)-ns(design.shoulderWidthCm))/2, ledge=Math.floor(indent/2);
      const d=indent-ledge, outer=nr(armDepth)-nr(design.shoulderDropCm);
      const arm=2*((ledge/sx)*dx+(outer-2*d)*dy/sy+Math.hypot(d*dx/sx,2*d*dy/sy));
      const top=ns(design.capTopWidthCm), last=Math.max(1,Math.round(top/6));
      const cuts=(ns(upper)+2-top)/2-ledge-last;
      let solutions=0;
      for(let slow=2;slow<=4;slow++) for(let middle=1;middle<cuts-1;middle++) {
        const fast=cuts-middle, h=4+fast+slow*middle;
        const edge=2*(ledge*dx/sx+2*dy/sy+fast*Math.hypot(dx/sx,dy/sy)+middle*Math.hypot(dx/sx,slow*dy/sy)+Math.hypot(last*dx/sx,2*dy/sy))+top*dx/sx;
        if(h%2===0 && h<outer && edge>=arm && Math.abs(edge-arm-design.capEaseCm)<=0.5) solutions++;
      }
      assert.equal(solutions,0);
      assert.throws(()=>geometry.build(state,artifact,design),{code:"CAP_SOLUTION_UNAVAILABLE"});
      return;
    }
    const g=geometry.build(state,artifact,design), b=g.body, s=g.sleeve;
    const ns=cm=>nearest(cm,sx,dx), nr=cm=>nearest(cm,sy,dy);
    assert.equal(b.panelStitches,ns(width)+2); assert.equal(b.neckStitches,ns(neckWidth));
    assert.equal(b.armhole.startRow,nr(length)-nr(armDepth)+1);
    assert.equal(b.shoulder.stitchesEach,(ns(design.shoulderWidthCm)+2-ns(neckWidth))/2);
    assert.equal(b.placket.startRow,nr(length)-nr(8+index)-nr(12+index)+1);
    assert.equal(s.upperStitches,ns(upper)+2); assert.equal(s.cuffStitchesAtMainGauge,ns(cuff)+2);
    // Infer contour runs from emitted edge events, without the solver's zones or score.
    const cap=s.cap, dec=cap.events.filter(e=>e.technique==="decrease");
    let previous=2, run=0, interval=0;
    let side=cap.events[0].count*dx/sx+2*dy/sy;
    for(const e of dec){
      const gap=e.row-previous;
      if(gap!==interval){side+=run*Math.hypot(dx/sx,interval*dy/sy);run=0;interval=gap;}
      run++;previous=e.row;
    }
    side+=run*Math.hypot(dx/sx,interval*dy/sy);
    side+=Math.hypot(cap.events.at(-1).count*dx/sx,2*dy/sy);
    const perimeter=2*side+cap.finalBindOff*dx/sx;
    near(perimeter,cap.perimeterCm);
    const paired=b.armhole.events.filter(e=>e.edge==="both");
    const curve=paired.length*2;
    const arm=2*(b.armhole.events[0].count*dx/sx+2*dy/sy+Math.hypot(paired.length*dx/sx,curve*dy/sy)
      +(b.shoulder.startRow-b.armhole.startRow-2-curve)*dy/sy);
    near(arm,b.armhole.perimeterCm);
    assert.ok(perimeter>=arm-1e-9 && Math.abs(perimeter-arm-design.capEaseCm)<=0.5+1e-9);

    const raw={...finishingFixture(),ribStitchesPer10Cm:22,ribRowsPer10Cm:30,buttonCount:2+family%3,
      buttonDiameterCm:1+index/4,hemHeightCm:3+index,cuffHeightCm:3+index/2,collarHeightCm:6+index};
    const f=finishingDomain.build(g,artifact,raw);
    const inspected={current:true,state:{status:"confirmed",finishing:{status:"confirmed"}},geometry:g,finishing:f,intake:{artifact}};
    for (const upperSide of ["A","B"]) {
      const slit=nr(design.placketLengthCm)*dy/sy;
      const neckCm=44+index;
      const records=Object.entries({prepare:{upperBand:upperSide},front_measure:{slitA:slit,slitB:slit,armA:arm/2,armB:arm/2},
        back_measure:{armA:arm/2,armB:arm/2},sleeve1_measure:{capCm:perimeter,frontCapCm:perimeter/2},sleeve2_measure:{capCm:perimeter,frontCapCm:perimeter/2},
        neck_measure:{neckCm},bands_measure:{upperWidthCm:3,lowerWidthCm:3}}).map(([stepId,input])=>({stepId,input}));
      const plan=poloPlan.build(inspected,records), steps=new Map(plan.steps.map(s=>[s.id,s]));
      assert.equal(steps.size,36);
      const seen=new Set();
      for(const step of plan.steps){assert.ok(step.text.every(x=>x.trim()));for(const dep of step.requires??[])assert.ok(seen.has(dep));seen.add(step.id);}
      for(const [name,cm,edgeHeight,totalLength] of [["back",width,raw.hemHeightCm,length],["front",width,raw.hemHeightCm,length],
        ["sleeve1",cuff,raw.cuffHeightCm,sleeveLength],["sleeve2",cuff,raw.cuffHeightCm,sleeveLength]]){
        const isSleeve=name.startsWith("sleeve"), cast=nearest(ns(cm)*dx/sx,22,10)+2;
        assert.equal(steps.get(name+"_cast").fields[0].target,cast);
        const rib=steps.get(name+"_rib").rows, main=steps.get(name+"_main");
        assert.equal(rib.length,nearest(edgeHeight,30,10));
        for(const [i,r] of rib.entries()){assert.equal(r.afterStitches,cast);assert.equal(r.side,i%2?"изнаночная":"лицевая");}
        assert.equal(main.rows.length,nr(totalLength-rib.length/3));
        replay(main,cast,isSleeve?cap.finalBindOff:0,rib.length,isSleeve);
        if(!isSleeve) panelOutline(main.rows,name==="front",{
          panel:ns(width)+2,shoulderWidth:ns(design.shoulderWidthCm)+2,neck:ns(neckWidth),slit:ns(design.placketWidthCm),
          firstArm:nr(length)-nr(armDepth)+1,firstShoulder:nr(length)-nr(design.shoulderDropCm)+1,
          firstNeck:nr(length)-nr(name==="front"?8+index:design.backNeckDepthCm)+1,
          firstSlit:nr(length)-nr(8+index)-nr(design.placketLengthCm)+1,
          shoulderRows:nr(design.shoulderDropCm),shoulderStitches:(ns(design.shoulderWidthCm)+2-ns(neckWidth))/2,
          offset:nr(length)-main.rows.length});
        if(isSleeve) assert.match(steps.get(name+"_close").text[0],new RegExp("оставшиеся "+cap.finalBindOff+" п"));
      }
      const band=steps.get("upper_pickup").derived;
      assert.equal(band.stitches,nearest(slit,22,10)+2);
      const pickText=steps.get("upper_pickup").text[0];
      if(band.stitches>g.body.placket.rows) {
        const [,anchors,doubles]=pickText.match(/Отметь (\d+) точек.*?В (\d+) равномерно/);
        assert.ok(+doubles<=+anchors);assert.equal(+anchors+ +doubles,band.stitches);
      } else assert.match(pickText,/по одной петле из выбранных рядов/);
      const holes=band.holes;
      assert.equal(holes.length,raw.buttonCount);
      for(const [i,h] of holes.entries()) {
        const target=raw.buttonEndMarginCm+i*((band.stitches-2)/2.2-2*raw.buttonEndMarginCm)/(raw.buttonCount-1);
        assert.ok(Math.abs((h.first+h.last-3)/4.4-target)<=0.5/2.2+1e-10);
      }
      const bottom=upperSide==="B";
      assert.match(steps.get("upper_pickup").text[0],bottom?/от низа к горловине/:/от горловины к низу/);
      assert.match(steps.get("lower_pickup").text[0],bottom?/от горловины к низу/:/от низа к горловине/);
      bandCheck(steps.get("upper_rib").rows,band.stitches,holes,bottom);
      const collar=steps.get("collar_pickup").derived;
      assert.equal(collar.stitches,nearest(neckCm+6,22,10)+2);
      assert.equal(collar.rows,nearest(raw.collarHeightCm,30,10));
      const collarRows=steps.get("collar_rib").rows;
      assert.equal(collarRows.length,collar.rows);
      assert.ok(collarRows.every((r,i)=>r.beforeStitches===collar.stitches && r.afterStitches===collar.stitches
        && r.side===(i%2?"изнаночная":"лицевая")));
      const fitStep=steps.get("sleeve_fit");
      for(const fit of fitStep.seamFit) near(fit.easeCm,perimeter-arm);
      poloPlan.validateCompletion(inspected,plan,fitStep,{done:true},0);
      records.find(r=>r.stepId==="sleeve1_measure").input.frontCapCm=arm/2-1;
      const skew=poloPlan.build(inspected,records).steps.find(s=>s.id==="sleeve_fit");
      assert.throws(()=>poloPlan.validateCompletion(inspected,plan,skew,{done:true},0),{code:"PLAN_SEAM_MISMATCH"});
      assert.match(steps.get("collar_pickup").text[0], /края планки А.*верху планки Б/);
    }
    const invalid=[
      [{buttonCount:6,buttonDiameterCm:3,buttonholeStitches:10},/пуговиц|отверсти/i],
      [{buttonCount:1},/Число пуговиц/],
      [{hemHeightCm:0},/Высота резинки/],
    ];
    for(const [patch,why] of invalid) assert.throws(()=>finishingDomain.build(g,artifact,{...raw,...patch}),why);
    for(const [patch,why] of [[{shoulderWidthCm:75},/плеч/],[{placketWidthCm:0.5},/планки/],[{backNeckDepthCm:0.5},/горловин/i]])
      assert.throws(()=>geometry.build(state,artifact,{...design,...patch}),why);
  });
};
