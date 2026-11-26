"use strict";

// Original YarnAI design policy. It designs a new garment; it does not recover
// the photographed garment's concealed pattern or certify physical fit.
(function initializeSetInGeometry(root) {
  const VERSION = "GARMENT_SET_IN_GEOMETRY_V1";
  const POLICY = "flat-straight-polo-symmetric-set-in-v1";
  const SOURCES = Object.freeze([
    "https://knitty.com/ISSUEwinter04/FEATwin04TBP.html",
    "https://knitty.com/ISSUEwinter05/FEATwin05TBP.html",
    "https://sloanerosenthalknits.com/blog/2019/3/5/technique-tuesday-seaming-tailored-shoulders",
  ]);
  function freeze(value) { if (value && typeof value === "object") { Object.freeze(value); Object.values(value).forEach(child => { if (child && typeof child === "object" && !Object.isFrozen(child)) freeze(child); }); } return value; }
  function fail(code, message, details = {}) { throw Object.assign(new Error(message), { code, userMessage: message, details }); }
  function number(value, name, min, max) {
    if (value === "" || value === null || typeof value === "boolean") fail("DESIGN_INPUT_MISSING", `Укажи: ${name}.`);
    const n = typeof value === "number" ? value : Number(value);
    if (!Number.isFinite(n) || n < min || n > max) fail("DESIGN_INPUT_INVALID", `${name}: допустимо от ${min} до ${max} см.`);
    return n;
  }
  const even = value => root.YarnAIGarmentCalculationPreview.roundCount(value, 2);
  function fingerprint(value) {
    const canonical = item => Array.isArray(item) ? `[${item.map(canonical).join(",")}]`
      : item && typeof item === "object" ? `{${Object.keys(item).sort().map(key => `${JSON.stringify(key)}:${canonical(item[key])}`).join(",")}}` : JSON.stringify(item);
    let hash = 0x811c9dc5;
    for (const char of canonical(value)) { hash ^= char.charCodeAt(0); hash = Math.imul(hash, 0x01000193) >>> 0; }
    return `fnv1a32:${hash.toString(16).padStart(8, "0")}`;
  }
  function normalizeDesign(value) {
    return {
      shoulderWidthCm: number(value?.shoulderWidthCm, "Ширина плеч готового изделия", 15, 80),
      shoulderDropCm: number(value?.shoulderDropCm, "Плечевой скос по высоте", 0.5, 6),
      backNeckDepthCm: number(value?.backNeckDepthCm, "Глубина горловины сзади", 0.5, 8),
      placketWidthCm: number(value?.placketWidthCm, "Ширина застёгнутой планки", 1.5, 6),
      placketLengthCm: number(value?.placketLengthCm, "Длина разреза ниже горловины", 3, 30),
      capTopWidthCm: number(value?.capTopWidthCm, "Ширина верхнего края оката", 3, 16),
      capEaseCm: number(value?.capEaseCm, "Посадка оката по длине шва", 0, 1.5),
    };
  }
  function proposals(snapshot) {
    const m = snapshot.normalizedInputs.measurements;
    return {
      shoulderWidthCm: m.body_shoulder_width?.valueCm ?? "",
      shoulderDropCm: 2, backNeckDepthCm: 2, placketWidthCm: 3, placketLengthCm: 12,
      capTopWidthCm: Math.round(Math.max(3, Math.min(16, m.finished_upper_arm_circumference.valueCm * 0.22)) * 10) / 10,
      capEaseCm: 0.5,
    };
  }
  // Quotient/remainder distribution has exact endpoints and no floating drift.
  function spread(total, slots) {
    if (!Number.isSafeInteger(total) || total < 0 || !Number.isSafeInteger(slots) || slots < 1) fail("SHAPING_SLOTS_INVALID", "Не удалось распределить формирование по рядам.");
    return Array.from({ length: slots }, (_, i) => Math.floor((i + 1) * total / slots) - Math.floor(i * total / slots));
  }
  function rowEvent(row, edge, count, technique, feature) { return { row, edge, count, technique, feature }; }
  function armholeEvents(indent, initial) {
    const events = [rowEvent(1, "right", initial, "bind_off", "armhole"), rowEvent(2, "left", initial, "bind_off", "armhole")];
    for (let i = 0; i < indent - initial; i++) events.push(rowEvent(4 + 2 * i, "both", 1, "decrease", "armhole"));
    return events;
  }
  function edgeLengthCm(stitches, rows, gauge, underarmStep = false) {
    const width = stitches / gauge.stitchesPerCm, height = rows / gauge.rowsPerCm;
    return underarmStep ? width + height : Math.hypot(width, height);
  }
  function sleeveCap(upper, initial, top, gauge, armhole, design) {
    if (top < 2) fail("CAP_TOP_TOO_NARROW", "При этой плотности на верхнем крае оката не остаётся петель для закрытия. Увеличь ширину верха оката или проверь плотность.");
    const topStep = Math.max(1, Math.round(top / 6));
    const decreases = (upper - 2 * initial - 2 * topStep - top) / 2;
    if (!Number.isSafeInteger(decreases) || decreases < 3 || decreases > 200) fail("CAP_WIDTH_INCOMPATIBLE", "Ширины рукава и верха оката не оставляют места для плавного формирования. Проверь ширину плеч, обхват рукава и предложенную ширину верха оката.");
    const targetLength = armhole.perimeterCm + design.capEaseCm;
    const targetHeight = armhole.outerHeightCm - top / gauge.stitchesPerCm / 2;
    if (targetHeight <= 0) fail("CAP_HEIGHT_INCOMPATIBLE", "Пройма слишком мелкая для выбранной ширины верха оката.");
    let best = null;
    for (const middleRate of [2, 3, 4]) {
      for (let lower = 1; lower <= decreases - 2; lower++) {
        for (let upperDecreases = 1; upperDecreases <= decreases - lower - 1; upperDecreases++) {
          const middle = decreases - lower - upperDecreases;
          const rows = 4 + lower + middle * middleRate + upperDecreases;
          // Both final bind-offs must start on their own edge in flat knitting.
          if (rows % 2 !== 0) continue;
          const heightCm = rows / gauge.rowsPerCm;
          const zones = [
            { stitches: initial, rows: 2, kind: "underarm_step" },
            { stitches: lower, rows: lower },
            { stitches: middle, rows: middle * middleRate },
            { stitches: upperDecreases, rows: upperDecreases },
            { stitches: topStep, rows: 2 },
          ];
          const lengths = zones.map(zone => edgeLengthCm(zone.stitches, zone.rows, gauge, zone.kind === "underarm_step"));
          const perimeterCm = 2 * lengths.reduce((a, b) => a + b, 0) + top / gauge.stitchesPerCm;
          const easeCm = perimeterCm - armhole.perimeterCm;
          // A knitted edge is not a rigid polyline. These are geometric estimates;
          // the actual blocked pieces must still be measured before sewing.
          if (easeCm < -1e-9 || Math.abs(easeCm - design.capEaseCm) > 0.5 || heightCm >= armhole.outerHeightCm) continue;
          const inflectionError = lengths[0] + lengths[1] - armhole.lowerCurveCm;
          const score = Math.abs(perimeterCm - targetLength) + 0.4 * Math.abs(heightCm - targetHeight) + 0.15 * Math.abs(inflectionError);
          if (!best || score < best.score) best = { lower, middle, middleRate, upper: upperDecreases, topStep, top, rows, heightCm, perimeterCm, easeCm, zones, score, targetHeightCm: targetHeight };
        }
      }
    }
    if (!best) fail("CAP_SOLUTION_UNAVAILABLE", "Не найден окат, который согласуется с этой проймой и допустимой посадкой. Проверь мерки проймы, плеч и верхней части рукава. Случайно менять числа ради прохождения проверки не нужно.");
    const events = [rowEvent(1, "right", initial, "bind_off", "cap"), rowEvent(2, "left", initial, "bind_off", "cap")];
    let row = 2;
    for (const [count, rate] of [[best.lower, 1], [best.middle, best.middleRate], [best.upper, 1]]) {
      for (let i = 0; i < count; i++) { row += rate; events.push(rowEvent(row, "both", 1, "decrease", "cap")); }
    }
    events.push(rowEvent(++row, "right", best.topStep, "bind_off", "cap"), rowEvent(++row, "left", best.topStep, "bind_off", "cap"));
    let count = upper;
    for (const event of events) { count -= event.count * (event.edge === "both" ? 2 : 1); event.afterStitches = count; }
    if (count !== top || row !== best.rows) fail("CAP_BALANCE_FAILED", "Внутренняя ошибка баланса петель оката.");
    return { ...best, initialBindOffEach: initial, startStitches: upper, finalBindOff: top, events };
  }
  function necklineSchedule(neckStitches, startRow, availableRows, existingGap = 0) {
    const removeEach = (neckStitches - existingGap) / 2;
    if (!Number.isSafeInteger(removeEach) || removeEach < 1) fail("NECKLINE_WIDTH_INCOMPATIBLE", "Планка должна быть уже горловины.");
    const centerEach = Math.max(1, Math.floor(removeEach / 2));
    const remainingEach = removeEach - centerEach;
    const pairs = Math.floor(availableRows / 2);
    if (pairs < 2) fail("NECKLINE_DEPTH_INCOMPATIBLE", "Для формирования горловины не хватает рядов. Уточни её глубину и плотность.");
    const remaining = spread(remainingEach, pairs - 1);
    return {
      centerBindOff: centerEach * 2 + existingGap,
      additionalCenterBindOff: centerEach * 2,
      startRow,
      perSide: [{ row: startRow, count: centerEach, technique: "bind_off" }, ...remaining.map((count, i) => ({ row: startRow + 2 * (i + 1), count, technique: count > 1 ? "bind_off" : "decrease" })).filter(event => event.count)],
      totalRemovedEach: removeEach,
    };
  }
  function build(state, artifact, designInput) {
    root.YarnAIGarmentCalculationPreview.build(state, artifact);
    const snapshot = state.confirmedSnapshot;
    const inputs = snapshot.normalizedInputs;
    const profile = snapshot.contractContextSnapshot.garmentRequirementsProfile;
    if (profile.constructionIdentity !== "seamed_set_in_sleeve") fail("CONSTRUCTION_UNSUPPORTED", "Этот расчёт относится только к отдельным деталям с втачным рукавом. Выбранная технология не меняется автоматически.");
    if (inputs.fitPreferences.body_shaping_preference?.value !== "straight"
        || inputs.fitPreferences.neckline_style?.value !== "polo_collar_with_placket"
        || inputs.fitPreferences.closure_style?.value !== "short_front_placket") {
      fail("DESIGN_UNSUPPORTED", "Первая полная конструкция — прямое поло с короткой передней планкой. Для другой выбранной формы этот расчёт не подставляется.");
    }
    const design = normalizeDesign(designInput);
    const m = key => inputs.measurements[key].valueCm;
    const sourceGauge = root.YarnAIManualCalculationIntake.gaugeBasis(artifact.gauge);
    const gauge = { stitchesPerCm: sourceGauge.stitches / sourceGauge.widthCm, rowsPerCm: sourceGauge.rows / sourceGauge.heightCm };
    const width = cm => even(cm * gauge.stitchesPerCm);
    const height = cm => even(cm * gauge.rowsPerCm);
    const panelMain = width(m("finished_bust_circumference") / 2);
    const shoulderMain = width(design.shoulderWidthCm);
    const neck = width(m("finished_neck_width"));
    const panelStitches = panelMain + 2; // one side-seam selvedge per edge
    const upperBodyStitches = shoulderMain + 2;
    const shoulderStitches = (upperBodyStitches - neck) / 2;
    const indent = (panelStitches - upperBodyStitches) / 2;
    const bodyRows = height(m("finished_body_length"));
    const armholeRows = height(m("finished_armhole_depth"));
    const shoulderRows = height(design.shoulderDropCm);
    const outerArmholeRows = armholeRows - shoulderRows;
    if (indent < 2 || shoulderStitches < 4 || shoulderRows < 2 || shoulderRows > 2 * shoulderStitches) fail("BODY_GEOMETRY_INCOMPATIBLE", "Ширина корпуса, плеч, горловины или плечевой скос не согласуются. Нужна пройма уже корпуса и положительная ширина каждого плеча.");
    const initial = Math.max(1, Math.floor(indent / 2));
    const remainingIndent = indent - initial;
    const curveRows = 2 + remainingIndent * 2;
    const straightRows = outerArmholeRows - curveRows;
    if (straightRows < 2) fail("ARMHOLE_TOO_SHALLOW", "Пройма слишком мелкая для выбранной разницы между шириной корпуса и плеч. Проверь глубину проймы и ширину плеч готового изделия.");
    const armStartRow = bodyRows - armholeRows + 1;
    if (armStartRow < 3) fail("BODY_TOO_SHORT", "Длина корпуса должна оставлять полотно ниже пройм.");
    const lowerCurveCm = initial / gauge.stitchesPerCm + 2 / gauge.rowsPerCm + Math.hypot(remainingIndent / gauge.stitchesPerCm, remainingIndent * 2 / gauge.rowsPerCm);
    const armhole = { startRow: armStartRow, initialBindOffEach: initial, decreasesEach: remainingIndent, curveRows, straightRows,
      outerHeightRows: outerArmholeRows, outerHeightCm: outerArmholeRows / gauge.rowsPerCm, lowerCurveCm,
      perimeterCm: 2 * (lowerCurveCm + straightRows / gauge.rowsPerCm),
      events: armholeEvents(indent, initial).map(event => ({ ...event, row: event.row + armStartRow - 1 })) };
    const shoulderStartRow = bodyRows - shoulderRows + 1;
    const shoulder = { stitchesEach: shoulderStitches, rows: shoulderRows, startRow: shoulderStartRow,
      bindOffGroups: spread(shoulderStitches, shoulderRows / 2) };
    const frontNeckRows = height(m("finished_front_neck_depth"));
    const backNeckRows = height(design.backNeckDepthCm);
    if (frontNeckRows <= backNeckRows || backNeckRows < 4 || frontNeckRows >= bodyRows - 2) fail("NECKLINE_DEPTH_INCOMPATIBLE", "Горловина спереди должна быть глубже задней; на заднее формирование нужны минимум четыре ряда.");
    const placket = { stitches: width(design.placketWidthCm), rows: height(design.placketLengthCm) };
    placket.startRow = bodyRows - frontNeckRows - placket.rows + 1;
    if (placket.startRow < 3 || placket.stitches < 2 || placket.stitches >= neck - 2) fail("PLACKET_INCOMPATIBLE", "Разрез выходит за нижний край или планка слишком широка для выбранной горловины.");
    const frontNeck = necklineSchedule(neck, bodyRows - frontNeckRows + 1, frontNeckRows, placket.stitches);
    const backNeck = necklineSchedule(neck, bodyRows - backNeckRows + 1, backNeckRows);
    // Every removed stitch is accounted for: no duplicated gap or neck removal.
    if (panelStitches - 2 * indent - placket.stitches - 2 * frontNeck.totalRemovedEach - 2 * shoulderStitches !== 0
        || panelStitches - 2 * indent - 2 * backNeck.totalRemovedEach - 2 * shoulderStitches !== 0) fail("BODY_BALANCE_FAILED", "Внутренняя ошибка баланса петель корпуса.");
    for (const [neckline, gap] of [[frontNeck, placket.stitches], [backNeck, 0]]) {
      let remaining = panelStitches / 2;
      for (let row = 1; row <= bodyRows; row++) {
        for (const event of armhole.events) if (event.row === row) remaining -= event.count * (event.edge === "both" ? 1 : 0.5);
        if (gap && row === placket.startRow) remaining -= gap / 2;
        for (const event of neckline.perSide) if (event.row === row) remaining -= event.count;
        const shoulderIndex = (row - shoulder.startRow) / 2;
        if (Number.isInteger(shoulderIndex) && shoulderIndex >= 0 && shoulderIndex < shoulder.bindOffGroups.length) remaining -= shoulder.bindOffGroups[shoulderIndex];
        if (remaining < -1e-9 || (remaining === 0 && row < bodyRows - 1)) fail("SHAPING_OVERLAP", "Горловина и плечевой скос расходуют петли раньше окончания детали. Уменьши скос или уточни глубину горловины.");
      }
    }
    const sleeveUpper = width(m("finished_upper_arm_circumference")) + 2;
    const sleeveCuff = width(m("finished_cuff_circumference")) + 2;
    const cap = sleeveCap(sleeveUpper, initial, width(design.capTopWidthCm), gauge, armhole, design);
    const sleeveRows = height(m("finished_sleeve_length"));
    const sleeveBodyRows = sleeveRows - cap.rows;
    if (sleeveBodyRows < 4) fail("SLEEVE_TOO_SHORT", "Окат занимает почти всю заданную длину рукава. Проверь длину рукава: здесь она измеряется от плеча до края, включая окат.");
    const increasePairs = (sleeveUpper - sleeveCuff) / 2;
    if (increasePairs < 0 || increasePairs > Math.floor((sleeveBodyRows - 2) / 2)) fail("SLEEVE_TAPER_INCOMPATIBLE", "Между краем рукава и окатом не хватает лицевых рядов для парных прибавок. Нужен другой контур рукава.");
    const output = { version: VERSION, policy: POLICY, status: "design_review", executable: false,
      source: { projectId: state.projectId, calculationId: state.calculationId, snapshotFingerprint: snapshot.fingerprint, intakeFingerprint: artifact.fingerprint },
      design, gauge, sources: SOURCES,
      body: { panelStitches, panelMainStitches: panelMain, upperBodyStitches, bodyRows, neckStitches: neck, achievedWidthCm: panelMain / gauge.stitchesPerCm, achievedLengthCm: bodyRows / gauge.rowsPerCm, armhole, shoulder, frontNeck, backNeck, placket },
      sleeve: { cuffStitchesAtMainGauge: sleeveCuff, upperStitches: sleeveUpper, totalRows: sleeveRows, bodyRows: sleeveBodyRows, increasePairs, cap },
      policies: [
        "Основное полотно — лицевая гладь: лицевые петли с лицевой стороны, изнаночные с изнанки. Это предложение технологии, не распознанный узор фотографии.",
        "Перед и спинка одинаковой ширины; проймы симметричные. По одной дополнительной кромочной петле с каждой стороны для шва.",
        "Половина горизонтального углубления проймы закрывается у подмышки; остальное формируется парными убавками через ряд.",
        "Окат подбирается перебором трёх зон убавок; его расчётный край не короче проймы. Периметры оценены по прямым участкам контура, а не измерены на готовом полотне.",
        "Размеры после округления и выбранную форму нужно проверить до начала работы. Перед вшиванием измерить обработанные детали; математическое согласование не гарантирует посадку на человеке.",
      ],
      remaining: ["Плотность и высота резинок", "Планка с петлями под реальные пуговицы", "Воротник и его плотность", "Расход пряжи", "Пошаговое выполнение и измерения деталей"] };
    output.fingerprint = fingerprint(output);
    return freeze(output);
  }
  const api = Object.freeze({ VERSION, POLICY, SOURCES, normalizeDesign, proposals, spread, sleeveCap, edgeLengthCm, build, fingerprint });
  root.YarnAIGarmentSetInGeometry = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
