"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fit = require("../src/yarnai/static/anthony-personal-fit.js");
const {profiles,gauges,sizes} = require("./fixtures/anthony-fit.cjs");
const input = {...profiles[0][1],...gauges[0]};
const calculate = changes => fit.calculate({...input,...changes},sizes);
const near = (a,b) => assert.ok(Math.abs(a-b)<1e-8, a+" != "+b);
function replay(start,shape,end) {
  const changes = new Set(shape.changeRows);
  assert.equal(changes.size,Math.abs(shape.pairs));
  let live = start;
  for (let row=1;row<=shape.rows;row++) {
    if (changes.has(row)) {
      assert.equal(row%2,1);
      live += Math.sign(shape.pairs)*2;
    }
    assert.ok(live>=3);
  }
  assert.equal(live,end);
}
for (const [name,p] of profiles) for (const gauge of gauges) test(name+" / "+gauge.basis,()=>{
  const g = fit.calculate({...p,...gauge},sizes);
  assert.deepEqual(g.errors,[]);
  const s=(gauge.labelSt ?? gauge.sampleSt)/10,r=(gauge.labelRows ?? gauge.sampleRows)/10;
  const expected = [p.hem+p.bodyEase,p.belly+p.bellyEase,p.chest+p.bodyEase];
  for (const [i,station] of g.body.entries()) {
    near(station.target*2,expected[i]);
    near(2*(station.stitches-2)/s,station.actual*2);
    assert.ok(station.actual*2>=expected[i]-1e-8 && station.actual*2<expected[i]+4/s);
    assert.equal(station.stitches%2,1);
    if (i) replay(g.body[i-1].stitches,station.shaping,station.stitches);
  }
  assert.equal(g.hemRib.stitches%2,1);
  assert.equal(g.cuffRib.stitches%2,1);
  assert.equal(g.hemRib.stitches+g.hemRib.change,g.body[0].stitches);
  assert.equal(g.cuffRib.stitches+g.cuffRib.change,g.cuff.stitches);
  assert.ok(g.increases.changeRows.every(row=>row>=3));
  replay(g.cuff.stitches,g.increases,g.upper.stitches);
  const h=g.armhole,c=g.cap;
  assert.equal(g.body.at(-1).stitches-2*(h.initial+h.dec),g.shoulders.stitches);
  const shoulder=g.shoulderGroups.reduce((a,b)=>a+b,0);
  assert.equal(2*shoulder+g.neck.stitches,g.shoulders.stitches);
  assert.equal(2*(shoulder+g.neck.dec)+g.neck.center,g.shoulders.stitches);
  assert.ok(g.neck.rows>=2*g.neck.dec+2);
  near(g.rib.rows*10/gauge.ribRows+g.sleeveRows/r,g.armLength);
  near(g.rib.rows*10/gauge.ribRows+(g.body.at(-1).row+h.rows+6)/r,g.length);
  // Independent contour lengths from the scheduled events, counting a top span once.
  let live=g.upper.fabric,last=0;
  for (const e of c.events) {
    assert.ok(e.row>last && e.row<=c.rows);
    if(e.technique==="bind_off") assert.equal(e.edge,e.row%2?"right":"left");
    live-=e.count*(e.edge==="both"?2:1);
    assert.equal(live,e.afterStitches);
    last=e.row;
  }
  assert.equal(live,c.finalBindOff);
  const under=h.initial/s+2/r;
  const armLength=2*(under+Math.hypot(h.dec/s,2*h.dec/r)+(h.rows-2-2*h.dec)/r);
  const capLength=2*(under+c.lower*Math.hypot(1/s,1/r)+
    c.middle*Math.hypot(1/s,c.middleRate/r)+c.upper*Math.hypot(1/s,1/r)+
    Math.hypot(c.topStep/s,2/r))+live/s;
  near(armLength,h.perimeterCm);
  near(capLength,c.perimeterCm);
  near(capLength-armLength,c.easeCm);
  assert.ok(c.heightCm<h.outerHeightCm);
});

for (const [name,changes,reason] of [
  ["missing facts",{head:"",chest:""},/Обхват головы/],
  ["zero",{upper:0},/Обхват руки/],["negative",{arm:-1},/Длина рукава/],
  ["mm",{chest:1000},/Обхват груди/],["inches",{units:"in"},/сантиметры/],
  ["half width",{chest:50},/Обхват груди/],["half width inconsistent with shoulder",{chest:70,shoulders:45},/обхваты груди/],
  ["insufficient ease",{bellyEase:-3},/Свобода по животу/],
  ["armhole",{depth:9,chest:150},/проймы/],["cap",{upper:18,upperEase:1,wrist:13},/окат/],
  ["short increase section",{arm:15,upper:54},/лицевых рядов/],
  ["short stomach segment",{belly:170,bellyHeight:9},/лицевых рядов/],
  ["missing label rows",{labelRows:""},/этикетки/],["partial swatch",{sampleSt:23},/образца/],
  ["waist lacks height",{waist:82},/талии/],["wrong source sizes",null,/размеры Anthony/],
]) test(name,()=>{
  const g=changes?calculate(changes):fit.calculate(input,[]);
  assert.ok(g.errors.some(e=>reason.test(e)),g.errors.join(" "));
  assert.equal(g.body,undefined);
});
test("seam mismatch stops release",()=>assert.throws(()=>fit.checkShoulders([4,4,5],[4,5,4]),/швы/));
test("belly changes are independent of shoulders, arm length and cap",()=>{
  const a=calculate({}), b=calculate(profiles[2][1]);
  assert.ok(b.body[1].stitches>a.body[1].stitches);
  for(const key of ["shoulders","shoulderGroups","cap","armLength","upper","sleeveRows","neck"]) assert.deepEqual(a[key],b[key]);
});
test("processed gauge wins and does not erase label values or change source profile",()=>{
  const both={...input,sampleSt:23,sampleRows:32};
  const before=structuredClone(both), g=fit.calculate(both,sizes);
  assert.equal(g.source,"swatch"); assert.deepEqual(both,before);
  assert.notEqual(g.body[0].stitches,calculate({}).body[0].stitches);
  assert.notEqual(g.sleeveRows,calculate({}).sleeveRows);
});
test("unknown rib axes stop only dependent counts",()=>{
  const g=calculate({ribSt:"",ribRows:""});
  assert.deepEqual(g.errors,[]); assert.equal(g.hemRib,null); assert.equal(g.cuffRib,null);
  assert.equal(g.rib.rows,null); assert.ok(g.sleeveRows>0);
  assert.ok(calculate({ribRows:""}).hemRib.stitches>0);
  assert.ok(calculate({ribSt:""}).rib.rows>0);
});
test("optional measured waist is its own height and width",()=>{
  const g=calculate({waist:90,waistHeight:30});
  assert.deepEqual(g.errors,[]); assert.equal(g.body[2].name,"Талия"); assert.equal(g.body[2].target,50);
});
test("neck design changes use available straight rows and matching shoulders",()=>{
  const original=calculate({}), g=calculate({neckWidth:23,neckDepth:9});
  assert.deepEqual(g.errors,[]);
  assert.ok(g.neck.stitches>original.neck.stitches && g.neck.depth>original.neck.depth);
  assert.ok(calculate({neckDepth:3}).errors.some(e=>e.includes("горловины")));
  assert.deepEqual(g.cap,original.cap);
});
