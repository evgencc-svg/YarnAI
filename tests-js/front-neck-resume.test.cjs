"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const front = require("../src/yarnai/static/graded-front-neck.js");

function side(part, start, decreases, first, second) {
  return { start, decreases, remaining:start-decreases, depth:'10"', endSide:part === "right" ? "RS" : "WS",
    shoulderSide:part === "right" ? "WS" : "RS", technique:part === "right" ? "k2tog" : "ssk",
    groups:[{count:first, rows:1}, {count:second, rows:2}] };
}
const examples = [
  { label:"52 in", center:29, start:101, right:side("right",36,6,10,10), left:side("left",36,6,10,10),
    neck:[[35,34,33,32,31,30],[35,34,33,32,31,30]], shoulders:[[20,10,0],[20,10,0]] },
  { label:"40 in", center:29, start:85, right:side("right",28,6,8,7), left:side("left",28,6,8,7),
    neck:[[27,26,25,24,23,22],[27,26,25,24,23,22]], shoulders:[[14,7,0],[14,7,0]] },
  { label:"asymmetric synthetic sections", center:9, start:46, right:side("right",17,2,5,5), left:side("left",20,3,3,7),
    neck:[[16,15],[19,18,17]], shoulders:[[10,5,0],[14,7,0]] },
];
for (const example of examples) test("each side and each row: "+example.label, () => {
  const s = {piece:"front", ...example};
  const events = front.replay(s);
  assert.deepEqual(events.slice(0,2).map(e=>[e.kind,e.row,e.side,e.undivided,e.held,e.right,e.closed]), [
    ["hold",1,"RS",s.start-s.left.start,s.left.start,0,0], ["split",1,"RS",0,s.left.start,s.right.start,s.center]]);
  assert.deepEqual(events.filter(e=>e.kind==="finish"||e.kind==="resume").map(e=>[e.kind,e.part,e.left,e.right,e.held]),
    [["finish","right",0,0,s.left.start],["resume","left",s.left.start,0,0],["finish","left",0,0,0]]);
  for (const [i,part] of ["right","left"].entries()) {
    const neck = events.filter(e=>e.part===part && e.phase==="neck");
    for (const [j,e] of neck.entries()) {
      const rs = j%2===1;
      assert.equal(e.row, j+2);
      assert.equal(e.side,rs ? "RS":"WS");
      assert.equal(e.kind,rs ? "decrease":"plain");
      assert.equal(e[part],s[part].start-Math.floor((j+1)/2));
      if (rs) assert.deepEqual([e.edge,e.technique],i?["end","ssk"]:["start","k2tog"]);
    }
    assert.equal(neck.at(-1).side,i?"WS":"RS");
    assert.deepEqual(neck.filter(e=>e.kind==="decrease").map(e=>e[part]),example.neck[i]);
    const shoulder=events.filter(e=>e.part===part && e.phase==="shoulder");
    assert.deepEqual(shoulder.map(e=>e.row),[1,2,3,4,5]);
    assert.deepEqual(shoulder.map(e=>e.kind),["bind_off","plain","bind_off","plain","bind_off"]);
    assert.deepEqual(shoulder.map(e=>e.side),i?["RS","WS","RS","WS","RS"]:["WS","RS","WS","RS","WS"]);
    assert.deepEqual(shoulder.filter(e=>e.count).map(e=>e[part]),example.shoulders[i]);
    assert.deepEqual(shoulder.filter(e=>e.count).map(e=>e.edge),Array(3).fill(i?"right":"left"));
  }
  for (const e of events) assert.equal(e.undivided+e.left+e.right+e.held+e.closed,s.start);
  assert.equal(events.at(-1).closed,s.start);
  assert.deepEqual(front.replay(s,events),events);
});
const base={piece:"front", ...examples[1]};
const find=(events,kind)=>events.find(e=>e.kind===kind);
for(const [name,change] of [
  ["split sum",s=>s.left.start++],["center exceeds fabric",s=>{s.center=99;}],
  ["unknown resumed section",(_,e)=>{find(e,"resume").part="sleeve";}],
  ["double resume",(_,e)=>{const i=e.findIndex(x=>x.kind==="resume");e.splice(i,0,e[i]);}],
  ["right commands on left",(_,e)=>{find(e,"decrease").part="left";}],
  ["wrong neck edge",(_,e)=>{find(e,"decrease").edge="end";}],
  ["wrong decrease slant",(_,e)=>{find(e,"decrease").technique="ssk";}],
  ["wrong row side",(_,e)=>{find(e,"decrease").side="WS";}],
  ["reordered shoulders with same sum",(_,e)=>{const b=e.filter(x=>x.kind==="bind_off");[b[0].count,b[1].count]=[b[1].count,b[0].count];}],
  ["work closed stitches",(_,e)=>e.push({...e.at(-2)})],
  ["back holder reused",(_,e)=>{find(e,"resume").holder="back_neck";}],
  ["unfinished side",(_,e)=>e.pop()],["missed row",(_,e)=>e.splice(3,1)],
  ["merged halves",(_,e)=>{const x=find(e,"split");x.right+=x.held;x.held=0;}],
  ["final balance corrupted",(_,e)=>{e.at(-1).closed--;}],
  ["wrong terminal live count",s=>s.right.remaining++],["more shoulder stitches than available",s=>s.right.groups[0].count++],
]) test("rejects "+name,()=>{
  const source=structuredClone(base), events=front.replay(source);
  change(source,events);
  assert.throws(()=>front.replay(source,events),e=>Boolean(e.userMessage));
});
