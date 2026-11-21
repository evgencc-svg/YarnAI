"use strict";

(function initializeDesignUI(root) {
  if (typeof document === "undefined") return;
  const domain = root.YarnAIGarmentSetInDesign, geometry = root.YarnAIGarmentSetInGeometry;
  const byId = id => document.getElementById(`set-in-design-${id}`);
  const panel = document.getElementById("set-in-design");
  const fields = [
    ["shoulderWidthCm", "Ширина плеч готового поло, см", 15, 80],
    ["shoulderDropCm", "Плечевой скос по высоте, см", 0.5, 6],
    ["backNeckDepthCm", "Глубина горловины сзади, см", 0.5, 8],
    ["placketWidthCm", "Ширина застёгнутой планки, см", 1.5, 6],
    ["placketLengthCm", "Длина разреза ниже горловины, см", 3, 30],
    ["capTopWidthCm", "Ширина верхнего края оката, см", 3, 16],
    ["capEaseCm", "Добавочная длина края оката для посадки, см", 0, 1.5],
  ];
  const inputs = {};
  let repository, projectId, inspected, sequence = 0, busy = false, dirty = false;
  for (const [key, title, min, max] of fields) {
    const label = document.createElement("label"), input = document.createElement("input");
    label.textContent = title; input.type = "number"; input.min = min; input.max = max; input.step = "0.1"; input.id = `set-in-${key}`;
    input.addEventListener("input", () => { dirty = true; byId("result").hidden = true; byId("consent").checked = false; root.YarnAIGarmentFinishingUI?.hide(); byId("status").textContent = "Параметры изменены. Рассчитай форму заново; прежнее подтверждение не относится к этим числам."; });
    label.append(input); byId("fields").append(label); inputs[key] = input;
  }
  const format = value => new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 2 }).format(value);
  function p(parent, text) { const item = document.createElement("p"); item.textContent = text; parent.append(item); }
  function read() { return Object.fromEntries(fields.map(([key]) => [key, inputs[key].value])); }
  async function refresh(repo, id, validation) {
    repository = repo; projectId = id;
    const token = ++sequence;
    const snap = validation?.confirmedSnapshot;
    const supported = validation?.status === "confirmed" && snap?.contractContextSnapshot?.garmentRequirementsProfile?.constructionIdentity === "seamed_set_in_sleeve"
      && snap?.normalizedInputs?.fitPreferences?.neckline_style?.value === "polo_collar_with_placket";
    panel.hidden = !supported;
    root.YarnAIGarmentFinishingUI?.hide();
    if (!supported) return;
    try {
      const current = await domain.inspectForProject(repo, id);
      if (token !== sequence) return;
      inspected = current;
      const values = current.state?.design || geometry.proposals(snap);
      for (const [key] of fields) inputs[key].value = values[key] ?? "";
      dirty = false;
      render();
    } catch (error) { if (token === sequence) { byId("status").textContent = error.userMessage || error.message; byId("result").hidden = true; } }
  }
  function render() {
    const g = inspected.geometry;
    root.YarnAIGarmentFinishingUI?.refresh(repository,projectId,inspected);
    byId("consent").checked = false;
    byId("result").hidden = !g;
    byId("status").textContent = inspected.problem?.userMessage || inspected.problem?.message || (inspected.state?.status === "confirmed" ? "Форма подтверждена и сохранена. Ниже — отделка и переход к пошаговому плану." : g ? "Форма рассчитана и сохранена для проверки. Проверь размеры и подтверди своё решение." : "Параметры пока только предложены. Их можно изменить перед расчётом.");
    byId("confirm").hidden = inspected.current && inspected.state.status === "confirmed";
    byId("consent-label").hidden = byId("confirm").hidden;
    byId("confirm").disabled = true;
    if (!g) return;
    const b = g.body, s = g.sleeve, gs = g.gauge.stitchesPerCm, gr = g.gauge.rowsPerCm;
    diagram(g);
    const values = byId("numbers"); values.replaceChildren();
    p(values, `Перед и спинка: по ${b.panelStitches} п., из них 2 кромочные для швов. Ширина детали без швов ${format(b.achievedWidthCm)} см; обхват ${format(2*b.achievedWidthCm)} см. Длина ${format(b.achievedLengthCm)} см.`);
    p(values, `Проймы начинаются на высоте ${format((b.armhole.startRow - 1)/gr)} см от низа. Ширина плеч без боковых кромочных ${format((b.upperBodyStitches-2)/gs)} см; горловина ${format(b.neckStitches/gs)} см. На каждое плечо остаётся ${b.shoulder.stitchesEach} п.`);
    p(values, `Горловина спереди ${format((b.bodyRows-b.frontNeck.startRow+1)/gr)} см, сзади ${format((b.bodyRows-b.backNeck.startRow+1)/gr)} см. Разрез ниже передней горловины ${format(b.placket.rows/gr)} см × ${format(b.placket.stitches/gs)} см.`);
    p(values, `Рукав без припусков на швы: обхват вверху ${format((s.upperStitches-2)/gs)} см, у манжеты ${format((s.cuffStitchesAtMainGauge-2)/gs)} см. Длина всего рукава ${format(s.totalRows/gr)} см, оката ${format(s.cap.heightCm)} см. Петли манжеты пока рассчитаны по основному образцу — для резинки нужен её образец.`);
    p(values, `Оценка шва: край проймы ${format(b.armhole.perimeterCm)} см, край оката ${format(s.cap.perimeterCm)} см; разница ${format(s.cap.easeCm)} см. Это расчёт по контуру, не измерение связанной детали. Перед вшиванием потребуется измерить обе обработанные детали.`);
    const method = byId("method"); method.replaceChildren();
    p(method, `Источник размеров: подтверждённые мерки; плотность основного образца ${format(gs)} петли/см и ${format(gr)} ряда/см. Целевые сантиметры умножаются на плотность, петли и ряды округляются к ближайшему чётному числу. Корпус и рукав получают ещё по 2 кромочные петли для швов.`);
    for (const text of g.policies) p(method, text);
    p(method, `Баланс корпуса: ${b.panelStitches} − ${2*(b.armhole.initialBindOffEach+b.armhole.decreasesEach)} для пройм − ${b.neckStitches} для горловины = ${2*b.shoulder.stitchesEach} для двух плеч. В переде ${b.placket.stitches} петель планки уже включены в удаление горловины.`);
    p(method, `Окат: ${s.upperStitches} − ${2*s.cap.initialBindOffEach} под мышкой − ${2*(s.cap.lower+s.cap.middle+s.cap.upper)} в трёх зонах убавок − ${2*s.cap.topStep} вверху = ${s.cap.finalBindOff} петель последнего закрытия. Контур оценивается по длинам участков; приближение высоты влияет только на выбор варианта и не доказывает посадку.`);
    for (const [i, url] of g.sources.entries()) { const link = document.createElement("a"); link.href = url; link.target = "_blank"; link.rel = "noreferrer"; link.textContent = ["Принципы проймы и оката — Knitty (английский)", "Геометрия оката — Knitty (английский)", "Соединение втачного рукава — Sloane Rosenthal (английский)"][i]; const line = document.createElement("p"); line.append(link); method.append(line); }
  }
  function diagram(g) {
    const ns = "http://www.w3.org/2000/svg", svg = document.createElementNS(ns, "svg");
    svg.setAttribute("viewBox", "0 0 740 340"); svg.setAttribute("role", "img"); svg.setAttribute("aria-label", "Расчётные контуры спинки, переда и рукава в одном масштабе. Резинки и воротник пока не выделены.");
    svg.style.width = "100%"; svg.style.maxWidth = "900px";
    const gs = g.gauge.stitchesPerCm, gr = g.gauge.rowsPerCm, b = g.body, s = g.sleeve;
    const scale = Math.min(3.6, 270 / Math.max(b.achievedLengthCm, s.totalRows/gr), 190 / b.achievedWidthCm);
    function path(points, offset) { const el = document.createElementNS(ns, "path"); el.setAttribute("d", points.map(([x,y],i) => `${i ? 'L' : 'M'}${offset+x*scale},${45+y*scale}`).join(" ")+" Z"); el.setAttribute("fill", "#e1e9e1"); el.setAttribute("stroke", "#355b4f"); el.setAttribute("stroke-width", "2"); svg.append(el); }
    function label(text, x) { const el = document.createElementNS(ns, "text"); el.setAttribute("x", x); el.setAttribute("y", "24"); el.setAttribute("font-size", "16"); el.textContent = text; svg.append(el); }
    const w=b.achievedWidthCm, h=b.achievedLengthCm, indent=(b.panelStitches-b.upperBodyStitches)/2/gs, shoulderY=b.shoulder.rows/gr, armY=(b.bodyRows-b.armhole.startRow+1)/gr, neckLeft=(w-b.neckStitches/gs)/2;
    for (const [neck,offset,title,gap] of [[b.backNeck,20,"Спинка",false],[b.frontNeck,265,"Перед",true]]) {
      const depth=(b.bodyRows-neck.startRow+1)/gr, gapHalf=b.placket.stitches/gs/2, center=neck.centerBindOff/gs/2;
      const top=[[neckLeft,0],[w/2-center,depth]];
      if(gap) top.push([w/2-gapHalf,depth],[w/2-gapHalf,depth+b.placket.rows/gr],[w/2+gapHalf,depth+b.placket.rows/gr],[w/2+gapHalf,depth]);
      top.push([w/2+center,depth],[w-neckLeft,0]);
      path([[0,h],[0,armY],[b.armhole.initialBindOffEach/gs,armY],[indent,armY-b.armhole.curveRows/gr],[indent,shoulderY],...top,[w-indent,shoulderY],[w-indent,armY-b.armhole.curveRows/gr],[w-b.armhole.initialBindOffEach/gs,armY],[w,armY],[w,h]],offset); label(title,offset);
    }
    const sw=(s.upperStitches-2)/gs, cuff=(s.cuffStitchesAtMainGauge-2)/gs, sh=s.totalRows/gr, cap=s.cap.heightCm;
    const one=[[0,cap]]; let x=0, y=cap;
    for(const z of s.cap.zones){x+=z.stitches/gs;y-=z.rows/gr;one.push([x,y]);}
    const mirrored=one.slice().reverse().map(([xx,yy])=>[sw-xx,yy]);
    path([[(sw-cuff)/2,sh],...one,...mirrored,[(sw+cuff)/2,sh]],530); label("Рукав × 2",530);
    byId("diagram").replaceChildren(svg);
  }
  async function mutate(action) {
    if(busy || !inspected) return;
    busy=true; byId("calculate").disabled=true; byId("confirm").disabled=true;
    for(const input of Object.values(inputs)) input.disabled=true;
    try { inspected=await action(); dirty=false; render(); }
    catch(error){ byId("status").textContent=error.userMessage||error.message; byId("result").hidden=true; }
    finally { busy=false; byId("calculate").disabled=false; for(const input of Object.values(inputs)) input.disabled=false; }
  }
  byId("calculate").addEventListener("click",()=>mutate(()=>domain.saveForProject(repository,projectId,read(),inspected.progress?.revision||0)));
  byId("consent").addEventListener("change",()=>{byId("confirm").disabled=busy||dirty||!byId("consent").checked;});
  byId("confirm").addEventListener("click",()=>{if(!dirty&&byId("consent").checked) return mutate(()=>domain.confirmForProject(repository,projectId,inspected.geometry.fingerprint,inspected.progress.revision));});
  root.YarnAIGarmentSetInDesignUI = Object.freeze({ refresh, accept(value) { inspected=value; render(); } });
})(typeof window !== "undefined" ? window : globalThis);
