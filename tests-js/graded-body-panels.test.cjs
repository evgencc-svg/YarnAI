"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { replay, read } = require("../src/yarnai/static/graded-body-panels");
const examples = [
  {label:"52 in",cast:131,bind:7,afterBind:117,pairs:8,afterArm:101,each:36,center:29,neck:6,groups:[10,10],saved:41,split:9,depth:11,
    rows:[124,117,115,115,113,113,111,111,109,109,107,107,105,105,103,103,101],backRows:[91,81,71,61,51,41]},
  {label:"40 in",cast:101,bind:4,afterBind:93,pairs:4,afterArm:85,each:28,center:29,neck:6,groups:[8,7],saved:41,split:7.5,depth:9.5,
    rows:[97,93,91,91,89,89,87,87,85],backRows:[77,69,62,55,48,41]},
  {label:"synthetic",cast:53,bind:3,afterBind:47,pairs:3,afterArm:41,each:15,center:11,neck:2,groups:[5,4],saved:15,split:5,depth:7,
    rows:[50,47,45,45,43,43,41],backRows:[36,31,27,23,19,15]},
];
function source(x) {
  const groups = (a,b) => [{count:x.groups[0],rows:a},{count:x.groups[1],rows:b}];
  function side(right) {
    return { start:x.each, remaining:x.each-x.neck, decreases:x.neck, depth:x.depth+'"', technique:right?"k2tog":"ssk",
      shoulderSide:right?"WS":"RS", endSide:right?"RS":"WS", groups:groups(1,2) };
  }
  return {...x,rib:3,body:17,small:4.5,large:5,gauge:{stitches:20,rows:27,span:4},backDepth:x.depth,
    back:{startStitches:x.afterArm,firstSide:"RS",groups:groups(2,4),armholeDepth:x.depth+'"',hold:{count:x.saved,destination:"back_neck"}},
    front:{piece:"front",start:x.afterArm,center:x.center,splitDepth:x.split+'"',right:side(true),left:side(false)}};
}
for (const x of examples) for (const piece of ["back","front"]) test(x.label+" "+piece,()=>{
  const s = source(x), p = replay(s,piece), events = p.events;
  assert.equal(events[0].before,0);
  assert.deepEqual(events.slice(0,3).map(e=>e.active),[x.cast,x.cast,x.cast]);
  assert.deepEqual(events.slice(1,3).map(e=>[e.inch,e.from,e.endSide]),[[3,"cast","WS"],[17,"cast","WS"]]);
  const rows = events.filter(e=>e.section==="armhole");
  assert.deepEqual(rows.map(e=>e.active),x.rows);
  rows.forEach((e,i)=>{
    assert.equal(e.row,i+1);
    assert.equal(e.side,i%2?"WS":"RS");
    assert.equal(e.edge,i===0?"right":i===1?"left":i%2?null:"both");
    if(i>=2 && !(i%2)) assert.deepEqual([e.startTechnique,e.endTechnique],["k2tog","ssk"]);
  });
  const straight = events[3+rows.length];
  assert.deepEqual([straight.from,straight.inch,straight.active,p.upperStart],["armhole",piece==="back"?x.depth:x.split,x.afterArm,x.afterArm]);
  if(piece==="back") assert.deepEqual(p.upper.rows.map(r=>r.afterStitches),x.backRows);
  else {
    assert.equal(p.upper.filter(e=>e.kind==="resume").length,1);
    assert.deepEqual(p.upper.filter(e=>e.kind==="split").map(e=>[e.right,e.held,e.count]),[[x.each,x.each,x.center]]);
    assert.equal(p.upper.filter(e=>e.kind==="decrease").length,2*x.neck);
  }
  for(const [i,e] of events.entries()){
    assert.equal(e.active+e.closed+e.decreased+e.temporary+e.saved,x.cast);
    if(i) assert.equal(e.before,events[i-1].active);
  }
  assert.deepEqual([events.at(-1).active,events.at(-1).temporary,events.at(-1).saved],[0,0,piece==="back"?x.saved:0]);
  assert.deepEqual(replay(s,piece,events),p);
});
for(const [name,piece,change] of [
  ["wrong side","back",e=>e[3].side="WS"],["wrong edge","front",e=>e[4].edge="right"],
  ["first decrease late","front",e=>e.splice(5,1)],["wrong tilt","back",e=>e[5].endTechnique="k2tog"],
  ["extra edging","back",e=>e[0].active+=2],["height reference","front",e=>e[2].from="armhole"],
  ["duplicate hold","back",e=>e.push(e.at(-1))],["lost back holder","back",e=>e.at(-1).saved=0],
  ["duplicate resume","front",e=>e.splice(e.findIndex(x=>x.kind==="resume"),0,e.find(x=>x.kind==="resume"))],
  ["unfinished front","front",e=>e.pop()],
]) test("detects "+name,()=>{
  const s=source(examples[1]), events=replay(s,piece).events;
  change(events);
  assert.throws(()=>replay(s,piece,events),{code:"GRADED_PANEL_INVALID"});
});
for(const [name,piece,change] of [
  ["wrong bind remainder","back",s=>s.afterBind--],["wrong final arm remainder","front",s=>s.afterArm+=2],
  ["wrong upper input","front",s=>s.front.start+=2],["wrong shoulder input","back",s=>s.back.startStitches-=2],
  ["negative straight length","back",s=>s.body=s.rib-1],["shallow armhole","front",s=>s.front.splitDepth='1"'],
  ["no room for neckline","front",s=>s.front.splitDepth='9.25"'],["wrong shoulder height","front",s=>s.front.left.depth='11"'],
  ["foreign holder","back",s=>s.back.hold.destination="front:left"],
]) test("rejects "+name,()=>{
  const s=source(examples[1]);change(s);
  assert.throws(()=>replay(s,piece),{code:"GRADED_PANEL_INVALID"});
});
