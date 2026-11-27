"use strict";

(function exposeFitView(root) {
  const api = root.YarnAIAnthonyPersonalFit;
  const fmt = n => n.toLocaleString("ru-RU",{maximumFractionDigits:2});
  function add(parent,tag,text) {
    const el = document.createElement(tag);
    if (text != null) el.textContent = text;
    parent.append(el);
    return el;
  }
  function select(parent,name,label,entries,value) {
    const el = add(add(parent,"label",label+" "),"select");
    el.name = name;
    for (const [key,text] of entries) add(el,"option",text).value = key;
    el.value = value || "";
    return el;
  }
  function renderResult(area,result,input) {
    area.replaceChildren();
    if (result.errors.length) {
      add(area,"h3","Что нужно уточнить");
      const list = add(area,"ul");
      for (const err of result.errors) add(list,"li",err);
      return;
    }
    const g = result, r = g.gauge.rowsPerCm;
    add(area,"h3","Предварительная геометрия Anthony");
    add(area,"p","Основание — "+(g.source==="swatch"?"обработанный образец":"этикетка производителя")+
      ", "+fmt(g.gauge.stitchesPerCm*10)+" п. × "+fmt(r*10)+" р. в 10 см. Ближайший авторский размер по готовой груди — "+
      g.nearest.size.replace(" in","″")+" ("+fmt(g.nearest.cm)+" см). Цель по груди — "+fmt(g.body.at(-1).target*2)+" см.");
    const grid = add(area,"table"), caption = add(grid,"caption","Размеры после округления. В числе петель детали учтены две кромочные.");
    caption.style.textAlign = "left";
    const head = add(add(grid,"thead"),"tr");
    for (const t of ["Участок","Цель, см","Расчёт, см","Разница, см","Петли / ряды"]) add(head,"th",t);
    const body = add(grid,"tbody");
    function line(name,target,actual,count) {
      const row = add(body,"tr");
      for (const value of [name,fmt(target),fmt(actual),fmt(actual-target),count]) add(row,"td",value);
    }
    for (const level of g.body) {
      line(level.name+" · полный обхват",2*level.target,2*level.actual,level.stitches+" п. на каждой детали");
      line(level.name+" · высота от низа",level.height,g.rib.height+level.row/r,level.row+" р. выше резинки");
    }
    const chest = g.body.at(-1);
    line("Ширина переда и спинки по груди, каждая",chest.target,chest.actual,chest.stitches+" п.");
    line("Ширина от плеча до плеча",g.shoulders.target,g.shoulders.actual,g.shoulders.stitches+" п.");
    line("Глубина от верхней точки плеча",+input.depth,(g.armhole.rows+6)/r,(g.armhole.rows+6)+" р.");
    line("Длина корпуса",+input.length,g.length,g.rib.rows ? g.rib.rows+chest.row+g.armhole.rows+6+" р." : "по замеру резинки");
    line("Ширина горловины",g.neck.target,g.neck.actual,g.neck.stitches+" п.");
    line("Глубина выреза по переду",g.neck.depthTarget,g.neck.depth,(g.neck.rows+6)+" р.");
    line("Рукав сразу над манжетой · обхват",g.cuff.target,g.cuff.actual,g.cuff.stitches+" п.");
    line("Рукав перед окатом · обхват",g.upper.target,g.upper.actual,g.upper.stitches+" п.");
    line("Рукав от края до подмышки",+input.arm,g.armLength,g.sleeveRows+" р. выше манжеты");
    if (g.rib.rows) line("Высота обеих резинок",g.rib.target,g.rib.height,g.rib.rows+" р.");
    for (const [name,w] of [["Нижняя резинка · ширина одной детали",g.hemRib],["Манжета · обхват",g.cuffRib]]) {
      if (w) line(name,w.target,w.actual,w.stitches+" п. набора, переход к глади "+(w.change>0?"+":"")+w.change+" п.");
    }
    if (g.cuffRib) line("Ширина сложенной манжеты",g.cuffRib.target/2,g.cuffRib.actual/2,g.cuffRib.stitches+" п. на полную деталь");
    add(area,"h4","Формирование деталей");
    const list = add(area,"ul");
    for (const station of g.body.slice(1)) {
      const p = station.shaping;
      add(list,"li","До уровня «"+station.name+"» по "+Math.abs(p.pairs)+(p.pairs<0?" убавок":" прибавок")+" с каждой стороны на "+p.rows+" р.");
    }
    add(list,"li","Пройма с каждого края — закрыть "+g.armhole.initial+" п., затем "+g.armhole.dec+" одиночных убавок через ряд и "+g.armhole.straight+" прямых рядов. Плечевые швы совпадают, группы "+g.shoulderGroups.join(" + ")+" п. с каждой стороны.");
    add(list,"li","Горловина спинки — "+g.neck.stitches+" п. Перед — центр "+g.neck.center+" п. и по "+g.neck.dec+" убавок; глубина до верхней точки плеча "+fmt(g.neck.depth)+" см. Контур до отделки около "+fmt(g.neck.opening)+" см, обхват головы "+fmt(g.head)+" см.");
    add(list,"li","Каждый рукав — "+g.increases.pairs+" парных прибавок. Ряды от конца манжеты: "+(g.increases.changeRows.join(", ")||"без прибавок")+".");
    add(list,"li","Окат — "+g.cap.rows+" р., высота "+fmt(g.cap.heightCm)+" см. После подмышки по краям "+g.cap.lower+" убавок в каждом ряду, "+g.cap.middle+" через каждые "+g.cap.middleRate+" р., затем "+g.cap.upper+" в каждом ряду. Верхние ступени по "+g.cap.topStep+" п., верх "+g.cap.top+" п. между кромочными.");
    add(list,"li","Полный контур проймы "+fmt(g.armhole.perimeterCm)+" см, оката "+fmt(g.cap.perimeterCm)+" см, окат минус пройма "+fmt(g.cap.easeCm)+" см. Допустимость припосадки требует замера.");
    for (const warning of g.warnings) add(area,"p",warning);
    add(area,"p","Полная индивидуальная инструкция по рядам ещё не рассчитана.");
  }
  function mount(host,{key,sizes,saved,hasAuthor,authorPanel,save}) {
    host.replaceChildren();
    host.hidden = false;
    const valid = saved?.version===1 && saved.key===key && ["author","personal"].includes(saved.mode) &&
      saved.input && typeof saved.input==="object" && !Array.isArray(saved.input);
    const input = valid ? saved.input : {};
    add(host,"h2","Как работать с Anthony");
    const mode = select(host,"mode","Режим",[["author","Исполнить авторский размер"],["personal","Рассчитать по своим меркам"]],valid?saved.mode:"author");
    const authorHint = add(host,"p","Чтобы увидеть авторские операции, выбери один размер в разборе материала.");
    const form = add(host,"div");
    const units = select(form,"units","Формат мерок",[["","Выбери"],["cm-full","Сантиметры, обхваты целиком, плечи по ширине"]],input.units);
    const basis = select(form,"basis","Источник плотности",[["","Выбери"],["label","Этикетка производителя"],["swatch","Обработанный контрольный образец"]],input.basis);
    add(form,"p","Если введены обе плотности глади, расчёт использует обработанный образец. Для смены источника на этикетку очисти поля образца.");
    const controls = {units,basis};
    for (const [id,title] of Object.entries(api.groups)) {
      const set = add(form,"fieldset");
      add(set,"legend",title);
      for (const [name,label,min,max,hint,group,optional] of api.fields) {
        if (group!==id) continue;
        const wrap = add(set,"label",label+(id!=="gauge"?(optional?" (необязательно)":" (обязательно)"):""));
        const el = add(wrap,"input");
        el.type = "number"; el.step = "any"; el.min = min; el.max = max;
        el.name = name; el.value = input[name] ?? "";
        add(wrap,"small",hint);
        controls[name] = el;
      }
    }
    const result = add(form,"div");
    result.id = "anthony-fit-result";
    const button = add(host,"button","Сохранить режим и введённые данные");
    button.type = "button"; button.className = "button button-primary";
    const status = add(host,"p");
    status.setAttribute("role","status");
    status.textContent = saved && !valid ? "Запись относится к другому источнику или версии. Данные для этого PDF не восстановлены." : valid ? "Сохранённые данные восстановлены." : "";
    function values() {return Object.fromEntries(Object.entries(controls).map(([k,c])=>[k,c.value]));}
    function refresh() {
      form.hidden = mode.value!=="personal";
      host.parentElement.classList.toggle("anthony-personal-mode",!form.hidden);
      authorPanel.hidden = !form.hidden || !hasAuthor;
      authorHint.hidden = !form.hidden || hasAuthor;
      if (!form.hidden) {
        const current = values();
        renderResult(result,api.calculate(current,sizes),current);
      }
    }
    function changed() {
      refresh();
      status.textContent = "Изменения ещё не сохранены.";
    }
    mode.addEventListener("change",changed);
    form.addEventListener("input",changed);
    button.addEventListener("click",async()=>{
      button.disabled = true;
      mode.disabled = true;
      for (const c of Object.values(controls)) c.disabled = true;
      try { await save({version:1,key,mode:mode.value,input:values()}); }
      catch (error) { status.textContent = "Сохранение не выполнено. "+(error.userMessage || error.message); }
      finally {
        button.disabled = false; mode.disabled = false;
        for (const c of Object.values(controls)) c.disabled = false;
      }
    });
    refresh();
  }
  root.YarnAIAnthonyFitView = {mount};
})(typeof window !== "undefined" ? window : globalThis);
