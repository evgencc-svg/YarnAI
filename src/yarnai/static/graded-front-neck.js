"use strict";

(function exposeFrontNeck(root) {
  const plan = root.YarnAIGarmentPoloPlan || require("./garment-polo-plan.js");
  // Fingerprint of the text extracted from the publisher's unchanged v2 PDF.
  // The erratum changes only the reference to the back; it supplies no counts.
  const correction = Object.freeze({
    textHash: "061619c1d7116656307f2f766657ad6f8ea1960900b30a4a613e894e16c0ebcb",
    url: "https://berroco.com/patterns/anthony/", date: "2020-11-19",
  });
  function check(ok, message) {
    if (!ok) plan.fail("FRONT_SECTION_INVALID", message);
  }
  const positive = n => Number.isSafeInteger(n) && n > 0;
  function match(text, rule, message) {
    const found = rule.exec(text);
    check(found, message);
    return found.slice(1);
  }
  function readSide(text, name) {
    const parts = text.split("Shape " + name + " Shoulder:");
    check(parts.length === 2, "Не определено начало плеча " + (name === "Right" ? "правой" : "левой") + " стороны.");
    const [technique, repeats, remaining, depth, endSide] = match(parts[0].trim(),
      /^Dec Row \(RS\): (K1, k2tog, knit to end|Knit to last 3 sts, SSK, k1)—1 st dec['’]d\. Rep Dec Row every RS row (\d{1,3}) times more—(\d{1,4}) sts\. Work even if necessary until armhole measures (\d{1,3}(?:[¼½¾]|\.\d+)?")\s*, end on (RS|WS)\.$/i,
      "Нужна однозначная последовательность убавок, их наклон и сторона перед началом плеча.");
    const [first, side, next, times, nextSide] = match(parts[1].trim(),
      /^Bind off (\d{1,4})(?: sts)? at beginning of the next (WS|RS) row, then (\d{1,4}) sts at beginning of the next (\d{1,3}) (WS|RS) rows\. Fasten off\.$/i,
      "Порядок плечевых закрытий или закрепление нити требуют сверки.");
    const atStart = /^K1, k2tog/i.test(technique);
    check(side === nextSide && side !== endSide && (name === "Right") === atStart
      && side === (name === "Right" ? "WS" : "RS"), "Край убавки или сторона плечевого закрытия противоречат положению половины переда.");
    return { technique: atStart ? "k2tog" : "ssk", decreases: 1 + Number(repeats), remaining: Number(remaining),
      depth, endSide, shoulderSide: side, groups: [{count:Number(first), rows:1}, {count:Number(next), rows:Number(times)}] };
  }
  function read(reading, textHash) {
    const fronts = reading.sections.filter(s => s.heading === "FRONT");
    check(fronts.length === 1 && fronts[0].vectors.every(v => v.selectionStatus === "selected"), "Размерные группы переда требуют сверки.");
    let text = fronts[0].projected.replace(/\s+/g, " ").trim();
    const corrected = textHash === correction.textHash && /^Work as for front\b/i.test(text);
    if (corrected) {
      text = text.replace(/^Work as for front/i, "Work as for back")
        .replace(/ NOTE: .*? (?=Shape Right Shoulder:)/, " ");
    }
    const sections = match(text, /^(.*?) Right Side: (.*?) Left Side: (.*?)$/, "Не удалось установить порядок работы обеих сторон.");
    const [splitDepth, start, marked, each, held, center, active] = match(sections[0],
      /^Work as for back until armholes measure (\d{1,3}(?:[¼½¾]|\.\d+)?")\s*, end on WS—(\d{1,4}) sts\. Mark center (\d{1,4}) sts on last row, with (\d{1,4}) sts on each side of markers\. Shape Neck: Next Row \(RS\): Knit to first marker, slip these (\d{1,4}) sts to holder for left side; bind off center (\d{1,4}) sts, removing markers, knit to end—(\d{1,4}) sts\.$/i,
      "Не подтверждены начало по спинке, лицевой ряд разделения или число петель каждой части.");
    check(marked === center && each === held && each === active, "Разметка переда расходится с командами разделения.");
    const rightIntro = /^Purl 1 WS row\. /i;
    check(rightIntro.test(sections[1]), "Не определён первый изнаночный ряд правой стороны.");
    const resume = /^With WS facing, slip (\d{1,4}) sts from holder to larger needle\. Join yarn and purl 1 WS row\. /i;
    check(match(sections[2], resume, "Не подтверждены держатель, сторона возврата и присоединение нити.")[0] === held,
      "Число возвращаемых петель расходится с отложенным.");
    return { piece:"front", start:Number(start), center:Number(center), splitDepth, corrected,
      right: { start:Number(active), ...readSide(sections[1].replace(rightIntro, ""), "Right") },
      left: { start:Number(held), ...readSide(sections[2].replace(resume, ""), "Left") } };
  }

  // Commands describe the order of physical operations. Neck rows on each
  // branch share split row 1. Shoulder rows restart at the measured landmark.
  function* schedule(s) {
    yield { kind:"hold", row:1, side:"RS", part:"left", holder:"front:left", count:s.left.start };
    yield { kind:"split", row:1, side:"RS", part:"front", count:s.center };
    for (const part of ["right", "left"]) {
      const d = s[part];
      if (part === "left") yield { kind:"resume", part, holder:"front:left", side:"WS", count:d.start };
      for (let row = 2; row <= 1 + 2 * d.decreases; row++) {
        const side = row % 2 ? "RS" : "WS";
        if (side === "WS") yield { kind:"plain", phase:"neck", part, row, side };
        else yield { kind:"decrease", phase:"neck", part, row, side, edge:part === "right" ? "start" : "end", technique:d.technique, count:1 };
      }
      if (d.endSide === "WS") {
        yield { kind:"plain", phase:"neck", part, row:2 + 2 * d.decreases, side:"WS" };
      }
      yield { kind:"measure", part, depth:d.depth, endSide:d.endSide, count:d.remaining };
      const shoulder = plan.replayShoulderSection({ startStitches:d.remaining, groups:d.groups, firstSide:d.shoulderSide, returnRows:true });
      for (const r of shoulder.rows) {
        yield { kind:r.count ? "bind_off" : "plain", phase:"shoulder", part, row:r.row, side:r.side, edge:r.edge, count:r.count };
      }
      yield { kind:"finish", part };
    }
  }

  function replay(s, commands) {
    check(s?.piece === "front" && [s.start, s.center, s.left?.start, s.right?.start].every(positive)
      && s.start === s.center + s.left.start + s.right.start, "Петли центра и двух сторон не сходятся с исходным остатком переда.");
    for (const part of ["right", "left"]) {
      const d = s[part];
      check(positive(d.decreases) && positive(d.remaining) && d.remaining + d.decreases === d.start,
        "Остаток перед плечом расходится с числом убавок горловины.");
      check(d.technique === (part === "right" ? "k2tog" : "ssk") && d.shoulderSide === (part === "right" ? "WS" : "RS")
        && d.endSide !== d.shoulderSide && ["RS","WS"].includes(d.endSide) && d.depth,
        "Сторона ряда, край или наклон убавки не соответствуют половине переда.");
    }
    check(commands === undefined || Array.isArray(commands), "Для проверки нужен упорядоченный список операций.");
    const work = { right:0, left:0 };
    let whole = s.start, held = 0, closed = 0, active = null;
    const events = [];
    for (const expected of schedule(s)) {
      const cmd = commands === undefined ? expected : commands[events.length];
      const position = "Операция №" + (events.length + 1) + ". ";
      check(cmd && cmd.kind === expected.kind, position + "Пропущено или переставлено действие по схеме.");
      check(cmd.part === expected.part && cmd.holder === expected.holder, position + "Выбрана другая сторона или чужой держатель.");
      check(cmd.row === expected.row && cmd.side === expected.side, position + "Номер ряда или сторона полотна расходятся со схемой.");
      check(cmd.edge === expected.edge && cmd.technique === expected.technique, position + "Край или наклон убавки расходятся со схемой.");
      check(Object.keys(expected).every(k => cmd[k] === expected[k]), position + "Число петель или условие перехода расходится с авторской командой.");
      const { part, kind } = cmd;
      if (kind === "split") {
        work.right = whole - cmd.count; whole = 0; closed = cmd.count; active = "right";
      } else if (kind === "hold") {
        held = cmd.count; whole -= held;
      } else if (kind === "resume") {
        check(active === null && held === cmd.count && work.left === 0, "Левая сторона отсутствует на своём держателе или уже возвращена.");
        active = "left"; work.left = held; held = 0;
      } else {
        check(active === part, "Эта сторона переда сейчас не находится в работе.");
        if (kind === "decrease" || kind === "bind_off") {
          const edge = cmd.side === "RS" ? "right" : "left";
          const opEdge = kind === "decrease" ? (cmd.edge === "start" ? edge : "left") : cmd.edge;
          const result = plan.singleSection(work[part], [{ kind, edge:opEdge, count:cmd.count }], edge, cmd.side === "RS" ? 1 : 2);
          closed += work[part] - result.after;
          work[part] = result.after;
        } else if (kind === "measure") {
          check(work[part] === cmd.count, "Не сошёлся остаток у начала плеча.");
        } else if (kind === "finish") {
          check(work[part] === 0, "У завершённой стороны остались живые петли.");
          active = null;
        }
      }
      check(whole + work.left + work.right + held + closed === s.start, "Нарушен баланс петель переда.");
      const event = { ...expected, undivided:whole, left:work.left, right:work.right, held, closed };
      check(Object.keys(cmd).every(k => Object.hasOwn(event, k) && cmd[k] === event[k]),
        "Состояние петель или дополнительные действия расходятся с результатом ряда.");
      events.push(event);
    }
    check(commands === undefined || commands.length === events.length, "После завершения переда обнаружены лишние операции.");
    check(active === null && held === 0 && closed === s.start, "Одна сторона переда осталась незавершённой.");
    return events;
  }
  const api = { correction, read, replay };
  root.YarnAIFrontNeck = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
