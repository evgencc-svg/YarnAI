"use strict";
const {test} = require("node:test");
const assert = require("node:assert/strict");
const sleeves = require("../src/yarnai/static/graded-sleeves");
const evidence = require("../src/yarnai/static/pattern-source-instruction-evidence");
const gauge = {stitches:20,rows:27,span:4};

// Independent row checkpoints, counted from the first increase after the 4-inch mark.
const sizes = [
  {size:"52 in", cast:49, upper:89, bind:7, afterBind:75, pairs:29, afterPairs:17, top:13,
    rows:[1,7,13,19,25,31,37,43,49,55,59,63,67,71,75,79,83,87,91,95], capRows:63},
  {size:"40 in", cast:45, upper:75, bind:4, afterBind:67, pairs:27, afterPairs:13, top:9,
    rows:[1,9,17,25,33,41,47,53,59,65,71,77,83,89,95], capRows:59},
];
// Independent three-column fixture, including a synthetic size.
const text = [
  'Finished Measurements', 'Chest – 40 (52, 54)"', 'BACK', 'FRONT', 'SLEEVES',
  'With smaller straight needles, cast on 45 (49, 33) sts. Work in 1x1 ribbing as for back for 3", end on WS.',
  'Change to larger needles and work even in St st until sleeve measures 4" from beginning, end on WS.',
  'Inc Row (RS): K1, M1R, k to last st, M1L, k1—2 sts inc’d.',
  'Rep Inc Row every 8th (6th, 4th) row 5 (9, 1) times, then every 6th (4th, 2nd) row 9 (10, 1) time(s)—75 (89, 39) sts.',
  'Work even until sleeve measures 19" from beginning, end on WS.',
  'Shape Cap: Bind off 4 (7, 3) sts at beginning of the next 2 rows—67 (75, 33) sts.',
  'Dec Row (RS): K1, k2tog, k to last 3 sts, SSK, k1—2 sts dec’d. Rep Dec Row every RS row 26 (28, 5) times more, end on WS—13 (17, 21) sts.',
  'Bind off 2 sts at beginning of the next 2 rows. Bind off remaining 9 (13, 17) sts.', 'FINISHING',
].join("\n");
function source(size, content=text) {
  const reading = evidence.readGradedSource(content,size);
  assert.ok(reading);
  return sleeves.read(reading,{selectedSize:size,gauge,small:4.5,large:5});
}
for (const x of sizes) test(x.size+" — both sleeves, every operation and balance",()=>{
  const s = source(x.size);
  const left = sleeves.replay(s,"left"), right = sleeves.replay(s,"right");
  assert.notEqual(left.piece,right.piece);
  assert.deepEqual(left.events,right.events);
  for (const plan of [left,right]) {
    const events = plan.events;
    assert.deepEqual(events.slice(0,3).map(e=>e.active),[x.cast,x.cast,x.cast]);
    assert.deepEqual(events.filter(e=>e.kind==="measure").map(e=>[e.inch,e.endSide,e.needle]),
      [[3,"WS",4.5],[4,"WS",5],[19,"WS",5]]);
    assert.deepEqual(events.filter(e=>e.kind==="increase").map(e=>e.row),x.rows);
    let active = x.cast;
    for (const e of events.filter(e=>e.section==="widen")) {
      assert.equal(e.before,active);
      if (x.rows.includes(e.row)) {
        active+=2;
        assert.deepEqual([e.side,e.startTechnique,e.endTechnique],["RS","M1R","M1L"]);
      }
      assert.equal(e.active,active);
    }
    assert.equal(active,x.upper);
    const cap = events.filter(e=>e.section==="cap");
    assert.equal(cap.length,x.capRows);
    cap.forEach((e,i)=>{
      assert.equal(e.before,active);
      const row = i+1;
      assert.deepEqual([e.row,e.side],[row,row%2 ? "RS":"WS"]);
      if (row<=2 || row>=x.capRows-2) {
        const n = row<=2 ? x.bind : row===x.capRows ? x.top : 2;
        assert.deepEqual([e.kind,e.edge,e.count],["bind_off",row%2?"right":"left",n]);
        active-=n;
      } else if (row%2) {
        assert.deepEqual([e.kind,e.startTechnique,e.endTechnique],["decrease","k2tog","SSK"]);
        active-=2;
      } else assert.equal(e.kind,"plain");
      assert.equal(e.active,active);
    });
    assert.deepEqual([cap[1].active,cap.at(-4).active,cap.at(-2).active,active],[x.afterBind,x.afterPairs,x.top,0]);
    assert.deepEqual(sleeves.replay(s,plan.piece,JSON.parse(JSON.stringify(events))),plan);
  }
});
test("synthetic size changes the increases, cap rows and final bind-off",()=>{
  const p=sleeves.replay(source("54 in"),"right");
  assert.deepEqual(p.events.filter(e=>e.kind==="increase").map(e=>[e.row,e.active]),[[1,35],[5,37],[7,39]]);
  assert.equal(p.events.at(-1).count,17);
});
for (const [label,mutate] of Object.entries({
  missingIncrease:e=>e.splice(e.findIndex(r=>r.kind==="increase"),1),
  extraIncrease:e=>e.splice(5,0,e[3]),
  wrongInterval:e=>{e.find(r=>r.kind==="increase" && r.row>1).row+=2;},
  wrongTilt:e=>{e[3].endTechnique="M1R";},
  wrongSide:e=>{e[3].side="WS";},
  firstCapEdge:e=>{e.find(r=>r.section==="cap").edge="left";},
  missingDecrease:e=>e.splice(e.findIndex(r=>r.kind==="decrease"),1),
  balance:e=>{e.at(-2).active++;},
  earlyBind:e=>e.splice(-4,2),
})) test("reject recorded "+label,()=>{
  const s=source("52 in"), rows=sleeves.replay(s,"right").events;
  mutate(rows);
  assert.throws(()=>sleeves.replay(s,"right",rows),/операц|остаток|завершён/);
});
for (const [from,to] of [["M1L","M1R"],["every RS row","every WS row"],["next 2 rows—","next 3 rows—"],
  ["75 (89, 39) sts.","76 (89, 39) sts."],["8th (6th, 4th)","7th (6th, 4th)"],
  ["5 (9, 1) times","5 (9) times"],["Change to larger needles","Increase 2 sts. Change to larger needles"],
  ["end on WS—","end on RS—"],["Bind off remaining","Work even. Bind off remaining"],
  ["SLEEVES\n",""],["19" + '"',"9" + '"']]) test("reject changed PDF instruction "+from,()=>{
  assert.throws(()=>sleeves.replay(source("40 in",text.replace(from,to)),"left"));
});
test("refuse to match a 52 inch cap with a 40 inch body",()=>{
  assert.throws(()=>sleeves.compare(sleeves.replay(source("52 in"),"left"),
    {spec:{selectedSize:"40 in"},front:{},back:{}}),/Размеры/);
});

for (const x of sizes) test(x.size + " — match both sides and estimate the sewing lines",()=>{
  const size = x.size, large = size === "52 in";
  const depth = large ? 11 : 9.5;
  const arms = [
    {kind:"bind_off",side:"RS",edge:"right",count:x.bind},
    {kind:"bind_off",side:"WS",edge:"left",count:x.bind},
  ];
  for (let i=0; i < (large ? 8 : 4); i++) arms.push({kind:"paired_decrease"});
  function panel(piece) {
    return {piece,selectedSize:size,events:arms.map(e=>({...e,section:"armhole"}))};
  }
  const spec = {selectedSize:size,gauge,backDepth:depth,front:{left:{depth:depth+'"'},right:{depth:depth+'"'}}};
  const panels = {spec,back:panel("back"),front:panel("front")};
  for (const piece of ["left","right"]) {
    const sleeve = sleeves.replay(source(size),piece);
    const comparison = sleeves.compare(sleeve,panels);
    assert.equal(comparison.capRows,large ? 62 : 58);
    assert.equal(comparison.capHeight.toFixed(2),large ? "23.33" : "21.83");
    assert.equal(comparison.capHalf.toFixed(2),large ? "35.21" : "30.85");
    assert.equal(comparison.delta.toFixed(2),large ? "4.94" : "8.13");
    const [front,back] = comparison.sides;
    assert.equal(front.armhole.toFixed(2),large ? "32.74" : "26.78");
    assert.equal(front.armhole,back.armhole);
    assert.equal(front.edge,piece === "left" ? "right" : "left");
    assert.notEqual(front.edge,back.edge);
    const other = structuredClone(panels);
    other.back.events.find(e=>e.edge===back.edge).count++;
    assert.throws(()=>sleeves.compare(sleeve,other),/подмышки/);
    const shallow = structuredClone(panels);
    shallow.spec.backDepth=2;
    assert.throws(()=>sleeves.compare(sleeve,shallow),/Высота/);
  }
});
