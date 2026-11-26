"use strict";

(function exposeBodyPanels(root) {
  const evidence = root.YarnAIPatternSourceInstructionEvidence || require("./pattern-source-instruction-evidence.js");
  const shoulders = root.YarnAIGarmentPoloPlan || require("./garment-polo-plan.js");
  const neckline = root.YarnAIFrontNeck || require("./graded-front-neck.js");

  function check(condition, message) {
    if (!condition) shoulders.fail("GRADED_PANEL_INVALID", message);
  }
  function inches(raw) {
    const match = /^(\d+(?:\.\d+)?)([¼½¾]?)\s*["″”]$/.exec(raw);
    check(match, "Не определена высота в дюймах.");
    return Number(match[1]) + ({"¼":0.25, "½":0.5, "¾":0.75}[match[2]] || 0);
  }
  function consume(text, pattern, label) {
    const match = pattern.exec(text);
    check(match, "Требует сверки участок «" + label + "».");
    return { values:match.slice(1), rest:text.slice(match[0].length).trim() };
  }
  function read(reading, text, digest) {
    const back = evidence.readBackShoulderSection(reading);
    check(back, "Не определён переход к плечам спинки.");
    const front = neckline.read(reading, digest);
    const header = text.split(/^\s*BACK\s*$/m)[0].replace(/\s+/g, " ");
    const needles = [...header.matchAll(/Knitting needles, sizes \d+ \(([\d.]+) mm\) and \d+ \(([\d.]+) mm\)/gi)];
    const gauges = [...header.matchAll(/(\d+) sts and (\d+) rows = (\d+(?:\.\d+)?)" in St st on larger needles/gi)];
    check(needles.length === 1 && gauges.length === 1, "Нужны однозначные спицы и плотность лицевой глади.");
    const passage = reading.sections.find(section => section.heading === "BACK").projected.replace(/\s+/g, " ").trim();
    const cast = consume(passage, /^With smaller straight needles, cast on (\d+) sts\. /i, "Набор");
    const rib = consume(cast.rest, /^Ribbing: Row 1 \(RS\): K1, \* p1, k1, rep from \* across\. Row 2: P1, \* k1, p1, rep from \* across\. Rep these 2 rows until piece measures ([\d.¼½¾]+")\s*from beginning, end on WS\. /i, "Резинка");
    const body = consume(rib.rest, /^Change to larger needles and work even in St st until piece measures ([\d.¼½¾]+")\s*from beginning, end on WS\. /i, "Корпус");
    const bind = consume(body.rest, /^Shape Armholes: Bind off (\d+) sts at beginning of the next 2 rows[—–](\d+) sts\. /i, "Начало пройм");
    const dec = consume(bind.rest, /^Dec Row \(RS\): K1, k2tog, knit to last 3 sts, SSK, k1—2 sts dec['’]d\. Rep Dec Row every RS row (\d+) times more—(\d+) sts\. /i, "Парные убавки пройм");
    const straight = consume(dec.rest, /^Work even until armholes measure ([\d.¼½¾]+")\s*, end on WS\. /i, "Прямой участок пройм");
    check(/^Shape Shoulders:/.test(straight.rest), "Между проймой и плечом осталась непрочитанная команда.");
    return { cast:Number(cast.values[0]), rib:inches(rib.values[0]), body:inches(body.values[0]),
      small:Number(needles[0][1]), large:Number(needles[0][2]), gauge:{stitches:+gauges[0][1], rows:+gauges[0][2], span:+gauges[0][3]},
      bind:Number(bind.values[0]), afterBind:Number(bind.values[1]), pairs:1 + Number(dec.values[0]), afterArm:Number(dec.values[1]),
      backDepth:inches(straight.values[0]), back, front };
  }

  function replay(source, piece, recorded) {
    const s = source, front = piece === "front";
    check(front || piece === "back", "Неизвестная деталь.");
    check([s.cast,s.bind,s.afterBind,s.pairs,s.afterArm,s.gauge.rows,s.gauge.stitches].every(n => Number.isSafeInteger(n) && n > 0)
      && s.cast % 2 === 1 && s.pairs <= s.cast / 2, "Числа не подходят для указанной резинки или проймы.");
    check([s.rib,s.body,s.small,s.large,s.gauge.span,s.backDepth].every(n => Number.isFinite(n) && n > 0)
      && s.rib < s.body && s.small < s.large, "Проверь высоты от набора и порядок смены спиц.");
    const depth = front ? inches(s.front.splitDepth) : s.backDepth;
    const rowsPerInch = s.gauge.rows / s.gauge.span;
    check(inches(s.back.armholeDepth) === s.backDepth && s.back.firstSide === "RS" && s.back.hold?.destination === "back_neck"
      && depth > 0 && Math.ceil(depth * rowsPerInch) >= 2 + 2 * s.pairs,
      "Глубина проймы или сторона ряда не согласуется с обязательными рядами.");
    if (front) {
      for (const side of [s.front.left,s.front.right]) {
        const shoulderDepth = inches(side.depth);
        const needed = 1 + 2 * side.decreases + Number(side.endSide === "WS");
        check(shoulderDepth === s.backDepth && shoulderDepth > depth && Math.ceil((shoulderDepth-depth)*rowsPerInch) >= needed,
          "Между разделением горловины и плечом не помещаются обязательные ряды или высоты деталей расходятся.");
      }
    }
    const events = [];
    let active = 0, closed = 0, decreased = 0, temporary = 0, saved = 0;
    function add(section, operation, nextActive, changes = {}) {
      const before = active;
      active = nextActive;
      closed += changes.closed || 0;
      decreased += changes.decreased || 0;
      temporary += changes.temporary || 0;
      saved += changes.saved || 0;
      check([active,closed,decreased,temporary,saved].every(n => Number.isSafeInteger(n) && n >= 0)
        && active + closed + decreased + temporary + saved === s.cast, "Нарушен баланс петель детали.");
      const event = {piece,section,...operation,before,active,closed,decreased,temporary,saved};
      if (recorded !== undefined) {
        const actual = recorded?.[events.length];
        check(actual && Object.keys(event).length === Object.keys(actual).length && Object.keys(event).every(k => actual[k] === event[k]),
          "Операция или остаток расходятся с исходной схемой. Номер действия " + (events.length + 1) + ".");
      }
      events.push(event);
    }
    add("cast",{kind:"cast_on",count:s.cast,needle:s.small},s.cast);
    add("rib",{kind:"measure",from:"cast",inch:s.rib,endSide:"WS",needle:s.small},active);
    add("body",{kind:"measure",from:"cast",inch:s.body,endSide:"WS",needle:s.large},active);
    for (let row = 1; row <= 1 + 2 * s.pairs; row++) {
      const side = row % 2 ? "RS" : "WS";
      const edge = side === "RS" ? "right" : "left";
      const kind = row <= 2 ? "bind_off" : side === "RS" ? "paired_decrease" : "plain";
      const ops = kind === "bind_off" ? [{kind,edge,count:s.bind}] : kind === "paired_decrease"
        ? [{kind:"decrease",edge:"right",count:1},{kind:"decrease",edge:"left",count:1}] : [];
      const {after} = shoulders.singleSection(active, ops, edge, row);
      const count = active - after;
      const techniques = kind === "paired_decrease" ? {startTechnique:"k2tog",endTechnique:"ssk"} : {};
      add("armhole",{kind,row,side,edge:row <= 2 ? edge : kind === "plain" ? null : "both",count,...techniques},after,
        kind === "bind_off" ? {closed:count} : {decreased:count});
      if (row === 2) check(active === s.afterBind, "Остаток после двух начальных закрытий расходится с PDF.");
    }
    const upperStart = active;
    check(active === s.afterArm && active === (front ? s.front.start : s.back.startStitches),
      "Фактический остаток пройм расходится со входом верхнего участка.");
    add("straight",{kind:"measure",from:"armhole",inch:depth,endSide:"WS"},active);
    let upper;
    if (front) {
      upper = neckline.replay({...s.front,start:active});
      for (const e of upper) {
        const changes = {temporary:e.held-temporary};
        if (e.kind === "decrease") changes.decreased = e.count;
        if (e.kind === "split" || e.kind === "bind_off") changes.closed = e.count;
        add(e.phase || e.kind,e,e.undivided+e.left+e.right,changes);
      }
    } else {
      upper = shoulders.replayShoulderSection({...s.back,startStitches:active});
      for (const r of upper.rows) add("shoulder",{kind:"bind_off",...r},r.afterStitches,{closed:r.count});
      add("back_neck",{kind:"hold",...upper.holder},upper.workingStitches,{saved:upper.holder.count});
    }
    check(active === 0 && temporary === 0 && saved === (front ? 0 : s.back.hold.count)
      && (recorded === undefined || recorded.length === events.length), "Деталь не завершена или обнаружено лишнее действие.");
    return {piece,events,upper,upperStart};
  }
  const api = {read,replay};
  root.YarnAIBodyPanels = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
