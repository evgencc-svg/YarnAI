"use strict";
const {test}=require("node:test");
const assert=require("node:assert/strict");
require("../src/yarnai/static/garment-set-in-geometry");
const assembly=require("../src/yarnai/static/graded-assembly");
const rules=require("../src/yarnai/static/pattern-source-instruction-evidence");
const {fingerprint}=require("../src/yarnai/static/garment-polo-plan");

// Independent abbreviated three-column source. The last column has different pickups and holder.
const source=[
  "Finished Measurements",'Chest – 40 (52, 54)"','16" length circular needle, size 7 (4.50 mm)',
  "BACK","FRONT","SLEEVES","FINISHING","Sew shoulder seams.",
  "Neckband: With RS facing, using circular needle, beginning at left shoulder seam, pick up and knit",
  "15 (15, 12) sts along left front neck edge, 29 (29, 25) sts across front neck edge,",
  "15 (15, 13) sts along right front neck edge, then knit 41 (41, 36) sts from back holder—100 (100, 86) sts.",
  'Place marker and join for working in the round. Work even in St st (knit EVERY round) for 2½" . Bind off loosely knitwise.',
  "Sew in sleeves. Sew side and sleeve seams. Weave in all ends and block as desired.",
].join("\n");
function parts(size,held) {
  const p=(piece,last)=>({piece,selectedSize:size,events:[{active:0,...last}]});
  const holder={destination:"back_neck",count:held};
  return {panels:{front:p("front",{temporary:0,kind:"finish"}),back:{...p("back",{kind:"hold",destination:"back_neck",saved:held}),upper:{holder}}},
    sleeves:["left","right"].map(side=>p(side,{kind:"bind_off",section:"cap"}))};
}
function read(size,text=source) { return assembly.read(rules.readGradedSource(text,size),text); }
function fixture(size="52 in") {
  const s=read(size), {panels,sleeves}=parts(size,s.held);
  const model=assembly.build(s,panels,sleeves);
  const records=model.steps.map(step=>({id:step.id,operation:fingerprint(step),confirmed:true,photos:[],
    values:Object.fromEntries(step.fields.map(f=>[f.id,f.expected??12.25]))}));
  return {s,model,records};
}
function recover(model,records) {return assembly.inspect(model,"test",assembly.journal({key:"test",records}));}
for (const [size,expected] of [["40 in",[15,29,15,41,100]],["52 in",[15,29,15,41,100]],["54 in",[12,25,13,36,86]]]) {
  test(size+" — columns, pickup order, one holder and all distinct seams",()=>{
    const {s,model,records}=fixture(size);
    assert.deepEqual([s.left,s.center,s.right,s.held,s.total],expected);
    assert.deepEqual([s.needle,s.cord,s.height],[4.5,16,6.35]);
    assert.deepEqual(model.steps.map(x=>x.id),["back","front","cap-left","cap-right","shoulder-left","shoulder-right","pickup","holder","neck",
      "place-left","attach-left","place-right","attach-right","side-left","sleeve-left","side-right","sleeve-right","finish"]);
    for (let i=0;i<=records.length;i++) {
      const prefix=records.slice(0,i), state=recover(model,prefix);
      assert.equal(state.held,i<8?s.held:0);
      assert.equal(state.active,i===7?s.total-s.held:i===8?s.total:0);
      assert.equal(new Set(state.used).size,state.used.length);
      assert.equal(state.next?.id,model.steps[i]?.id);
    }
    assert.equal(recover(model,records).used.length,16);
  });
}
for (const [label,mutate] of Object.entries({
  "lost back stitches":p=>p.panels.back.events[0].saved--,
  "front holder outstanding":p=>p.panels.front.events[0].temporary++,
  "incorrect sleeve":p=>p.sleeves[1].piece="left",
  "wrong size":p=>p.sleeves[0].selectedSize="40 in",
  "unfinished sleeve":p=>p.sleeves[0].events[0].active++,
})) test("refuses "+label,()=>{
  const s=read("52 in"), p=parts(s.size,s.held); mutate(p);
  assert.throws(()=>assembly.build(s,p.panels,p.sleeves));
});
for (const [from,to] of [["RS facing","WS facing"],["left shoulder seam","right shoulder seam"],
  ["left front neck edge","right front neck edge"],[" sts across front neck edge,"," sts,"],
  ["using circular needle","using straight needles"],["knit EVERY round","alternate knit and purl"],
  ["Place marker and join","Join and place marker"],["Sew in sleeves.","Sew side seams first."],
  ["Weave in all ends and block as desired.",""],["front neck edge, then knit","front neck edge, then hold"],
  ['16" length circular','16" length straight'],["(15, 13)","(15)"]]) test("rejects changed source "+from,()=>{
    assert.throws(()=>read("52 in",source.replace(from,to)));
  });
test("rejects an internally inconsistent pickup sum",()=>{
  const s=read("52 in",source.replace("100 (100, 86)","100 (99, 86)")),p=parts(s.size,s.held);
  assert.throws(()=>assembly.build(s,p.panels,p.sleeves));
});
for (const [label,mutate] of Object.entries({
  "wrong needle":r=>r[6].values.needle=5,
  "wrong pickup":r=>r[6].values.left--,
  "missing pickup":r=>delete r[6].values.right,
  "holder twice":r=>r[8]=r[7],
  "swapped edge":r=>r[4].operation=r[5].operation,
  "same seam twice":r=>r[15]=r[13],
  "wrong sleeve":r=>r[10]=r[12],
  "premature finish":r=>r.splice(0,17),
  "missing measurement":r=>delete r[9].values.capBack,
  "unconfirmed basting":r=>r[9].confirmed=false,
  "wrong neckline height":r=>r[8].values.height=3,
  "missing checkpoint photo":r=>r[4].photos.push("missing"),
})) test("rejects journal with "+label,()=>{
  const {model,records}=fixture();mutate(records);assert.throws(()=>recover(model,records));
});
test("resume waiting, saved measured prefix and exact photo binding",()=>{
  const {model,records}=fixture();
  records[0].photos=["p"];
  const photos=[{photo_id:"p",purpose:assembly.purpose("test","back")}];
  const saved=assembly.journal({key:"test",records:records.slice(0,4),waiting:"shoulder-left",draft:{front:12}});
  const decoded=JSON.parse(JSON.stringify(saved));
  assert.equal(assembly.inspect(model,"test",decoded,photos).next.id,"shoulder-left");
  assert.throws(()=>assembly.inspect(model,"another-project",decoded,photos));
  assert.throws(()=>assembly.inspect(model,"test",decoded,[{...photos[0],purpose:"elsewhere"}]));
  decoded.records.pop();
  assert.throws(()=>assembly.inspect(model,"test",decoded,photos));
});
