"use strict";

(function gradedRaglanInstruction(globalObject) {
  const review = globalObject.YarnAIPatternTechnologyReview || (typeof require === "function" && require("./pattern-technology-review.js"));
  const cm = n => n.toLocaleString("ru-RU", { maximumFractionDigits: 1 });
  const blocked = message => ({ state: "blocked", message });
  function build(replay, gauge, input, source) {
    if (!replay?.valid || source?.number !== "DROPS 269-3" || source.size !== "XXL") return blocked("Для полной инструкции нужен проверенный разбор DROPS 269-3, размер XXL.");
    const needed = { stockSt: "петли глади на 10 см", stockRows: "круги глади на 10 см", ribStitches: "петли резинки", ribWidth: "ширина образца резинки", ribRounds: "круги резинки", ribHeight: "высота образца резинки", targetRib: "выбранный обхват края", shoulderWidth: "ширина плеч", upperArm: "обхват плеча в широкой части", belly: "наибольший обхват живота", atHem: "обхват тела на уровне края", totalLength: "длина от плеча до края", armLength: "длина рукава от подмышки", depth: "глубина кокетки от основания горловины по переду" };
    const missing = Object.entries(needed).filter(([k]) => !(Number.isFinite(input?.[k]) && input[k] > 0 && input[k] <= 1000)).map(([, v]) => v);
    if (!["measured", "synthetic"].includes(input?.basis)) missing.push("происхождение мерок");
    if (typeof input?.yarn !== "string" || !input.yarn.trim()) missing.push("пряжа образцов");
    if (!input?.plainChoice) missing.push("один вариант сужения");
    if (missing.length) return blocked("Для полной инструкции нужны " + missing.join(", ") + ".");
    const f = replay.facts;
    if (!gauge || gauge.unit !== "cm" || !(gauge.per > 0) || Math.abs(input.stockSt / 10 - gauge.stitches / gauge.per) > 1e-7) return blocked("Плотность глади по ширине отличается от авторской. Для сохранения исходных петель верха нужен образец с авторской плотностью.");
    const ribRowsPerCm = input.ribRounds / input.ribHeight;
    const ribStPerCm = input.ribStitches / input.ribWidth;
    const shoulderOffset = f.shoulderLength - f.frontLength;
    const bodyCm = input.totalLength - shoulderOffset - input.depth - f.hemCm;
    const sleeveCm = input.armLength - f.cuffCm;
    if (bodyCm <= 0 || sleeveCm <= 0) return blocked("Длины изделия или рукава недостаточно для выбранной кокетки и резинок.");
    const adjusted = { ...replay, facts: { ...f, yokeCm: input.depth, hemStartCm: input.depth + bodyCm, cuffStartCm: sleeveCm } };
    const target = { stitches: input.stockSt, rows: input.stockRows, per: 10, unit: "cm" };
    const taper = review.planTwoPhaseBodyTaper(adjusted, target, input);
    const o = taper?.options?.find(x => x.plain === Number(input.plainChoice));
    if (!o || !taper.useTarget) return blocked(taper?.problem || "Выбранный вариант корпуса не помещается в заданные размеры и число кругов.");
    const c = review.calculateConstraintAwareTopDownCounts({ twoPhaseReplay: adjusted, sourceGauge: gauge, adaptationGauge: target }, { size: source.size }).chosenCandidate;
    if (!c || c.neck !== f.castOn || c.full !== f.fullRepeats || c.bodyOnly !== f.bodyRepeats || c.held !== f.leftHeld ||
        c.front !== f.front || c.underarm !== f.leftUnderarm || c.fast !== f.fastRepeats || c.slow !== f.slowRepeats ||
        c.beforeCuff !== f.preCuff || c.cuff !== f.cuff) return blocked("При этой плотности и длинах авторские серии прибавок или убавок не помещаются. Проверь высоту кокетки, длину рукава и плотность глади.");
    if (c.chestCm < Math.max(input.chest, input.belly) || c.armCm < input.upperArm || o.ribCm < input.atHem) return blocked("Расчётный обхват меньше мерки тела по груди, животу, рукаву или краю. Проверь выбор посадки.");
    const neckRounds = Math.round(f.neckCm * ribRowsPerCm);
    const cuffRounds = Math.round(f.cuffCm * ribRowsPerCm);
    const ribRounds = taper.ribRounds;
    const firstEnd = 2 * c.full - 1;
    const secondStart = firstEnd + 2;
    const validSchedule = (rounds, limit) => rounds.every((r, i) => Number.isInteger(r) && r >= 1 && r <= limit && (!i || r - rounds[i - 1] >= 2));
    if (Math.min(neckRounds, cuffRounds, ribRounds) < 1 || c.lastIncrease >= c.yokeRows ||
        !validSchedule(o.rounds, taper.bodyRounds) || !validSchedule(c.sleeveDecreaseRows, c.sleeveRows) ||
        c.neck + c.full * 8 !== c.midpoint || c.midpoint + c.bodyOnly * 4 !== 2 * (c.held + c.front) ||
        2 * (c.front + c.underarm) !== c.body || c.held + c.underarm !== c.arm ||
        c.body - 4 * o.rounds.length !== o.plain || o.plain + o.gain !== o.rib ||
        c.arm - 2 * c.sleeveDecreaseRows.length !== c.beforeCuff || c.beforeCuff + f.cuffGain !== c.cuff ||
        [c.neck, o.rib, c.cuff].some(n => n % 2)) return blocked("Переходы между кругами и деталями не согласованы. Инструкция недоступна.");

    const sections = [];
    let count = 0;
    function phase(title) { sections.push({ title, steps: [] }); }
    function step(title, instruction, ...details) { sections.at(-1).steps.push({ number: ++count, title, instruction, details }); }
    const note = "П. — петля, кр. — круг. Резинка 1 × 1 — чередуй одну лицевую и одну изнаночную. Гладь по кругу — все петли лицевые.";
    const decrease = "За четыре петли до метки провяжи две вместе лицевой, затем четыре лицевые (метка посередине). Сними одну как лицевую, провяжи следующую лицевой и протяни её через снятую.";
    function ribChange(previous, next) {
      const delta = next - previous;
      if (!delta) return `Сохрани ${next} п.`;
      const changes = Math.abs(delta);
      const base = Math.floor(previous / changes);
      const long = previous % changes;
      const groups = long ? `${long} групп по ${base + 1} и ${changes - long} по ${base}` : `${changes} групп по ${base}`;
      const act = delta > 0 ? "после последней петли каждой группы прибавь одну из протяжки скрещённой" : "две последние петли каждой группы провяжи вместе";
      return `Распредели исходные ${previous} п. на ${groups}. ${long ? "Расположи более длинные группы равномерно по кругу. " : ""}В первом круге ${act}. Формируй резинку, считая уже полученные петли. Итог — ${next}.`;
    }
    const close = "Закрой по рисунку без стягивания: провяжи очередную петлю лицевой или изнаночной и протяни её через предыдущую, обрежь нить и протяни конец через последнюю петлю.";
    phase("Горловина и кокетка");
    step("Набор и горловина", `На спицы ${f.ribNeedle} мм набери ${c.neck} п. Замкни в круг без перекрута, отметь начало у правого плеча со стороны спины. Свяжи круги с 1-го по ${neckRounds}-й резинкой, около ${cm(f.neckCm)} см. ${note}`,
      `После последнего круга закрепи отдельную метку после ${f.midFrontMarker}-й петли. Отсюда измеряй длину по середине переда.`);
    step("Четыре линии реглана", `Перейди на ${f.mainNeedle} мм. От начала круга отметь первую петлю, пропусти ${c.sleeve} п. рукава, отметь следующую, пропусти ${c.panel} п. переда, отметь следующую, пропусти ${c.sleeve} п. второго рукава и отметь следующую. До начала остаётся ${c.panel} п. спинки.`,
      "Реглан — четыре отмеченные петли на границах деталей. Метки переставляй вверх по тем же линиям.");
    step("Прибавки для всех деталей", `Считай круги глади заново. В нечётных кругах с 1-го по ${firstEnd}-й сделай по накиду до и после каждой отмеченной петли. У первой метки один накид приходится на начало круга, другой на конец. Итого ${c.full} раз по 8 петель, ${c.neck} → ${c.midpoint}.`,
      "В следующем круге провязывай накиды скрещёнными лицевыми, чтобы закрыть отверстие: перед линией перекрути накид вправо, после линии — влево. Чётные круги вяжи без новых прибавок.");
    step("Прибавки только на корпусе", `В нечётных кругах с ${secondStart}-го по ${c.lastIncrease}-й делай накиды только со стороны переда и спинки: перед первой меткой, после второй, перед третьей и после четвёртой. Получится ${c.bodyOnly} раз по 4 петли, ${c.midpoint} → ${c.total}.`,
      `В остальных кругах до ${c.yokeRows}-го включительно вяжи гладью. Контроль от метки переда — около ${cm(input.depth)} см.`);
    phase("Корпус");
    step("Разделение и подрезы", `Провяжи одну петлю спинки. Перенеси ${c.held} п. первого рукава на вспомогательную нить. Набери ${c.underarm} п. подреза (перемычки под рукой), провяжи ${c.front} п. переда. Отложи ${c.held} п. второго рукава, набери ещё ${c.underarm} п. и провяжи ${c.front - 1} п. спинки.`,
      `Корпус — ${c.body} п., около ${cm(c.chestCm)} см. Пометь середину каждого подреза. Отсчёт кругов корпуса начни со следующего круга.`);
    step("Сужение корпуса", `Вяжи гладью с 1-го по ${taper.bodyRounds}-й круг. У обеих боковых меток выполняй парную убавку в кругах ${o.rounds.join(", ")}. ${decrease} В каждом таком круге уйдут 4 петли. Остальные круги вяжи прямо.`,
      `После каждого круга с убавками останется соответственно ${o.rounds.map((_, i) => c.body - 4 * (i + 1)).join(", ")} п. До резинки около ${cm(bodyCm)} см от подреза. Обхват глади около ${cm(o.width)} см.`);
    step("Нижняя резинка и закрытие", `Перейди на спицы ${f.hemNeedle} мм. ${ribChange(o.plain, o.rib)} Свяжи резинкой круги с 1-го по ${ribRounds}-й, включая переход. ${close}`,
      `Контроль после высыхания: край около ${cm(o.ribCm)} см, высота ${cm(f.hemCm)} см. От метки на переде около ${cm(input.totalLength - shoulderOffset)} см, от плеча около ${cm(input.totalLength)} см.`);
    for (const side of ["Первый рукав", "Второй рукав"]) {
      phase(side);
      step("Верни отложенные петли", `На спицы ${f.sleeveNeedle} мм перенеси ${c.held} п. этого рукава и подними по одной из всех ${c.underarm} п. подреза. Пометь середину подреза. Для удобства парной убавки веди счёт кругов от точки за четыре петли до этой метки. На спицах ${c.arm} п., около ${cm(c.armCm)} см.`, "Если в уголке есть отверстие, подними соседнюю перемычку и провяжи её скрещённой вместе с крайней петлёй, сохраняя общее число.");
      step("Две серии убавок", `Провяжи круг 1 лицевыми. У метки подреза убавляй по 2 петли. Первая серия — круги ${c.sleeveDecreaseRows.slice(0,c.fast).join(", ")}. После неё ${c.arm - 2 * c.fast} п. Вторая серия — круги ${c.sleeveDecreaseRows.slice(c.fast).join(", ")}. После неё ${c.beforeCuff} п. ${decrease}`,
        `Остальные круги вяжи лицевыми до ${c.sleeveRows}-го включительно. Измерь от подреза около ${cm(sleeveCm)} см.`);
      step("Манжета и закрытие", `Перейди на спицы ${f.cuffNeedle} мм. ${ribChange(c.beforeCuff, c.cuff)} Свяжи резинкой круги с 1-го по ${cuffRounds}-й, включая переход. ${close}`,
        `Манжета около ${cm(f.cuffCm)} см высотой и ${cm(c.cuff / ribStPerCm)} см по кругу. Рукав от подреза около ${cm(input.armLength)} см.`);
    }
    phase("Завершение");
    step("Заправь концы и проверь размеры", `Закрепи и спрячь концы нитей, проверь уголки подрезов. Обработай свитер как образец, высуши горизонтально. Измерь грудь (${cm(c.chestCm)} см), край (${cm(o.ribCm)} см), длину от плеча (${cm(input.totalLength)} см) и оба рукава (${cm(input.armLength)} см).`, "Сверь симметрию рукавов. На примерке проверь свободу плеч и живота, высоту подрезов и эластичность закрытого края.");
    return { state: "ready", model: {
      title: "Barley Field • Индивидуальный свитер", purpose: input.basis === "synthetic" ? "Тестовый проект · искусственные мерки и образцы" : "Предварительная инструкция по введённым меркам",
      beforeStart: [
        { label: "Основа", value: `${source.title}, ${source.author}, ${source.number}, размер ${source.size}. Сверяй сантиметры по высушенному полотну.` },
        { label: "Пряжа и инструменты", value: `${input.yarn}. Круговые спицы ${f.mainNeedle} и ${f.ribNeedle} мм, спицы для малой окружности, метки, две вспомогательные нити, сантиметр и игла. Расход индивидуального изделия не измерен.` },
        { label: "Образцы по кругу", value: `Гладь ${cm(input.stockSt)} п. и ${cm(input.stockRows)} кр. на 10 см. Резинка на меньших спицах: ${input.ribStitches} п. на ${cm(input.ribWidth)} см и по вертикали ${input.ribRounds} кр. на ${cm(input.ribHeight)} см. Один образец для горловины, низа и манжет.` },
        { label: "Мерки и посадка", value: `Грудь ${cm(input.chest)}, живот ${cm(input.belly)}, ремень ${cm(input.belt)}, бёдра ${cm(input.hips)}, тело у края ${cm(input.atHem)}, плечи ${cm(input.shoulderWidth)}, верх руки ${cm(input.upperArm)} см. Прибавка по груди около ${cm(c.chestCm - input.chest)} см. Ширину плеч проверь на примерке реглана.` }
      ],
      changes: [{ title: "Сужение после разделения", before: `${f.preHem} п. перед нижней резинкой.`, after: `${o.plain} п. перед резинкой, ${o.rib} в резинке.`, why: "Выбранный обхват корпуса и измеренная плотность резинки.", practical: "Горловина, обе серии реглана и петли рукавов сохраняют авторское распределение." }],
      glossary: [], statuses: { virtual: "Баланс петель, порядок прибавок и убавок, парность резинок и симметрия рукавов проверены расчётом.", physical: "Физическое вязание и посадка на человеке не проверены." },
      stepCount: count, sections, legalNotice: "Индивидуальный расчёт YarnAI по DROPS Design 269-3. Для личного использования владельцем схемы."
    } };
  }
  function inspectSaved(aggregate) {
    const saved = aggregate?.project?.draft_input?.graded_body_fit;
    if (!saved?.instruction) return blocked("Полная инструкция ещё не сохранена. Проверь мерки, выбери вариант корпуса и сохрани расчёт.");
    const semantic = globalObject.YarnAIPatternSemanticAnalysis.inspectAggregate(aggregate);
    const extraction = globalObject.YarnAIPatternContentExtraction.inspectAggregate(aggregate);
    if (![semantic, extraction].every(i => ["completed", "partial"].includes(i.state))) return blocked("Исходный файл изменился или недоступен. Обнови расчёт.");
    const analysis = semantic.analysis;
    const size = analysis.result.sizing.selectedSize;
    const key = JSON.stringify([analysis.sourceFingerprint, analysis.sourceExtractionRevision, size]);
    if (saved.source !== key) return blocked("Для этих исходных данных нужно заново сохранить инструкцию.");
    const ids = analysis.result.evidenceDomains?.sourcePatternFileIds || [];
    const files = extraction.extraction.result.files.filter(f => ids.includes(f.sourceFileId) && f.extractionStatus === "extracted" && f.text);
    const gauges = analysis.result.gauge.entries.filter(g => g.unit === "cm" && g.stitches > 0 && g.rows > 0);
    if (files.length !== 1 || gauges.length !== 1) return blocked("Нужны один подтверждённый источник и одна плотность.");
    const reader = globalObject.YarnAIPatternSourceInstructionEvidence;
    const reading = reader.readGradedSource(files[0].text, size);
    const current = build(reader.readTwoPhaseRaglan(reading), gauges[0], saved.input, { ...reading?.attribution, size });
    if (current.state !== "ready") return current;
    if (JSON.stringify(current.model) !== JSON.stringify(saved.instruction)) return blocked("Сохранённая инструкция отличается от текущего расчёта. Сохрани её заново.");
    return current;
  }
  const api = { build, inspectSaved };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  globalObject.YarnAIGradedInstruction = api;
})(typeof window !== "undefined" ? window : globalThis);
