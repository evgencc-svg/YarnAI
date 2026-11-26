"use strict";

(function exposeSleeves(root) {
  const plan = root.YarnAIGarmentPoloPlan || require("./garment-polo-plan.js");
  const body = root.YarnAIBodyPanels || require("./graded-body-panels.js");
  const geometry = root.YarnAIGarmentSetInGeometry || require("./garment-set-in-geometry.js");

  function check(ok, message) {
    if (!ok) plan.fail("GRADED_SLEEVE_INVALID", message);
  }

  function read(reading, panel) {
    const sections = reading.sections.filter(s => s.heading === "SLEEVES");
    check(reading.measuredPieces && sections.length === 1 && sections[0].vectors.every(v => v.selectionStatus === "selected"),
      "Нужен однозначный размерный столбец и один полный раздел рукавов.");
    check(panel.selectedSize === reading.selectedSize, "Размеры рукава и корпуса различаются.");
    let text = sections[0].projected.replace(/\s+/g, " ").trim();
    function take(pattern, label) {
      const match = pattern.exec(text);
      check(match, "Проверь в исходном PDF участок «" + label + "».");
      text = text.slice(match[0].length).trim();
      return match.slice(1);
    }
    const [cast, rib] = take(/^With smaller straight needles, cast on (\d+) sts\. Work in 1x1 ribbing as for back for ([\d.¼½¾]+")\s*, end on WS\./i, "Манжета");
    const [start] = take(/^Change to larger needles and work even in St st until sleeve measures ([\d.¼½¾]+")\s*from beginning, end on WS\./i, "Гладь после манжеты");
    take(/^Inc Row \(RS\): K1, M1R, k to last st, M1L, k1—2 sts inc['’]d\./i, "Первая пара прибавок");
    const [rate1, times1, rate2, times2, upper] = take(/^Rep Inc Row every (\d+)\s*(?:th|st|nd|rd)? row (\d+) times, then every (\d+)\s*(?:th|st|nd|rd)? row (\d+) time\(s\)—\s*(\d+) sts\./i, "Группы прибавок");
    const [length] = take(/^Work even until sleeve measures ([\d.¼½¾]+")\s*from beginning, end on WS\./i, "Длина до оката");
    const [bind, afterBind] = take(/^Shape Cap: Bind off (\d+) sts at beginning of the next 2 rows—\s*(\d+) sts\./i, "Подмышка");
    const [more, afterPairs] = take(/^Dec Row \(RS\): K1, k2tog, k to last 3 sts, SSK, k1—2 sts dec['’]d\. Rep Dec Row every RS row (\d+) times more, end on WS—\s*(\d+) sts\./i, "Парные убавки оката");
    const [step, top] = take(/^Bind off (\d+) sts at beginning of the next 2 rows\. Bind off remaining (\d+) sts\.$/i, "Верх оката");
    return {selectedSize:reading.selectedSize, small:panel.small, large:panel.large, gauge:panel.gauge,
      cast:+cast, rib:body.inches(rib), start:body.inches(start), length:body.inches(length),
      groups:[{every:+rate1,times:+times1},{every:+rate2,times:+times2}], upper:+upper,
      bind:+bind, afterBind:+afterBind, pairs:1+Number(more), afterPairs:+afterPairs, step:+step, top:+top};
  }

  function replay(s, piece, recorded) {
    check(["left","right"].includes(piece), "Укажи сторону рукава.");
    const positive = n => Number.isSafeInteger(n) && n > 0;
    check([s.cast,s.upper,s.bind,s.afterBind,s.pairs,s.afterPairs,s.step,s.top].every(positive)
      && s.cast % 2 === 1 && s.cast >= 3 && s.upper <= 10000 && s.small > 0 && s.large > s.small
      && s.rib > 0 && s.start > s.rib && s.length > s.start, "Проверь набор, высоты, спицы и остатки.");
    const rowsAvailable = (s.length - s.start) * s.gauge.rows / s.gauge.span;
    check(Number.isFinite(rowsAvailable) && rowsAvailable > 0 && rowsAvailable < 10000, "Не определена плотность глади.");
    let lastIncrease = 1, pairCount = 1;
    for (const g of s.groups) {
      check(Number.isSafeInteger(g.times) && g.times >= 0 && Number.isSafeInteger(g.every) && g.every >= 0
        && (!g.times || (g.every >= 2 && g.every % 2 === 0)), "Интервал прибавок должен приводить на лицевую сторону.");
      pairCount += g.times;
      lastIncrease += g.times * g.every;
    }
    check(s.cast + 2 * pairCount === s.upper && s.upper - 2*s.bind === s.afterBind
      && s.afterBind - 2*s.pairs === s.afterPairs && s.afterPairs - 2*s.step === s.top,
      "Остатки после формообразования расходятся с PDF.");
    check(lastIncrease + 1 <= Math.ceil(rowsAvailable), "Прибавки и изнаночный ряд не помещаются до оката при указанной плотности.");
    let active = 0;
    const events = [];
    function add(section, kind, after, details = {}) {
      const event = {section,kind,before:active,active:after,...details};
      if (recorded !== undefined) {
        const actual = recorded?.[events.length];
        check(actual && Object.keys(actual).length === Object.keys(event).length && Object.keys(event).every(k => actual[k] === event[k]),
          "Нарушена операция или остаток. Действие " + (events.length + 1) + ".");
      }
      events.push(event);
      active = after;
    }
    add("cuff","cast_on",s.cast,{needle:s.small});
    add("cuff","measure",active,{inch:s.rib,endSide:"WS",needle:s.small});
    add("stockinette","measure",active,{inch:s.start,endSide:"WS",needle:s.large});
    const increases = new Set([1]);
    let next = 1;
    for (const g of s.groups) for (let i = 0; i < g.times; i++) {
      next += g.every;
      increases.add(next);
    }
    for (let row = 1; row <= lastIncrease; row++) {
      const side = row % 2 ? "RS" : "WS";
      if (increases.has(row)) add("widen","increase",active+2,{row,side,startTechnique:"M1R",endTechnique:"M1L"});
      else add("widen","plain",active,{row,side});
    }
    add("upper","measure",active,{inch:s.length,endSide:"WS",needle:s.large});

    const lastRow = 2 + 2*s.pairs + 3;
    for (let row = 1; row <= lastRow; row++) {
      const side = row % 2 ? "RS" : "WS";
      const edge = side === "RS" ? "right" : "left";
      if (row <= 2 || row >= lastRow - 2) {
        const count = row <= 2 ? s.bind : row === lastRow ? s.top : s.step;
        const after = plan.singleSection(active,[{kind:"bind_off",edge,count}],edge,row).after;
        add("cap","bind_off",after,{row,side,edge,count});
      } else if (side === "RS") {
        const ops = ["right","left"].map(edge => ({kind:"decrease",count:1,edge}));
        add("cap","decrease",plan.singleSection(active,ops,edge,row).after,{row,side,startTechnique:"k2tog",endTechnique:"SSK"});
      } else add("cap","plain",active,{row,side});
    }
    check(active === 0 && (recorded === undefined || recorded.length === events.length), "Рукав не завершён или есть лишняя операция.");
    return {piece,selectedSize:s.selectedSize,events};
  }

  function compare(sleeve, panels) {
    const {spec} = panels;
    const {selectedSize,events,piece} = sleeve;
    check(selectedSize && [spec,panels.back,panels.front].every(p => p.selectedSize === selectedSize), "Размеры рукава и корпуса различаются.");
    const cm = spec.gauge.span * 2.54;
    const gauge = {stitchesPerCm:spec.gauge.stitches/cm, rowsPerCm:spec.gauge.rows/cm};
    const length = (n,r,step=false) => geometry.edgeLengthCm(n,r,gauge,step);
    const cap = events.filter(e => e.section === "cap");
    const capPairs = cap.filter(e => e.kind === "decrease").length;
    const capRows = cap.length - 1; // Final bind-off runs across the top.
    const capHeight = length(0,capRows);
    const capHalf = length(cap[0].count,2,true) + length(capPairs,2*capPairs)
      + length(cap.at(-2).count,2) + length(cap.at(-1).count/2,0);
    const sides = [panels.front,panels.back].map(panel => {
      const rows = panel.events.filter(e => e.section === "armhole");
      const edge = (panel.piece === "front") === (piece === "left") ? "right" : "left"; // viewed on the right side of each panel
      const underarm = rows.find(e => e.edge === edge);
      check(underarm && rows[0].side === "RS" && rows[1].side === "WS" && rows[0].edge === "right" && rows[1].edge === "left"
        && underarm.count === cap[0].count && cap[0].edge === "right" && cap[1].edge === "left" && cap[0].count === cap[1].count,
        "Закрытия у подмышки или стороны соединения расходятся.");
      const pairs = rows.filter(e => e.kind === "paired_decrease").length;
      const inches = panel.piece === "front" ? body.inches(spec.front[edge === "right" ? "left" : "right"].depth) : spec.backDepth;
      const depth = inches * 2.54;
      const straight = depth - length(0,2+2*pairs);
      check(straight >= 0 && capHeight < depth, "Высота оката или участок проймы требует сверки.");
      const armhole = length(underarm.count,2,true) + length(pairs,2*pairs) + straight;
      return {panel:panel.piece,edge,depth,armhole,delta:capHalf-armhole};
    });
    return {capRows,capHeight,capHalf,sides,delta:sides.reduce((sum,s) => sum+s.delta,0)};
  }

  const api = {read,replay,compare};
  root.YarnAIGradedSleeves = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
