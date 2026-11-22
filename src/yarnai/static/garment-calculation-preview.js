"use strict";

// A projection of current, confirmed intake. Never an executable knitting plan.
(function initializeGarmentCalculationPreview(root) {
  const VERSION = "GARMENT_CALCULATION_PREVIEW_V1";
  function fail(message) { throw new Error(message); }
  function positive(value, label) {
    if (!Number.isFinite(value) || value <= 0) fail(`Неверное значение: ${label}.`);
    return value;
  }
  function build(state, artifact) {
    root.YarnAIManualIntakeValidation.requireValidState(state);
    if (state.status !== "confirmed" || state.abstain) fail("Сначала подтверди актуальные исходные данные.");
    const snapshot = state.confirmedSnapshot;
    const source = snapshot.sourceSnapshot;
    if (!artifact || artifact.status !== "draft" || artifact.intakeId !== source.intake.id
        || artifact.revision !== source.intake.revision || artifact.fingerprint !== source.intake.fingerprint
        || root.YarnAIManualCalculationIntake.artifactFingerprint(artifact) !== artifact.fingerprint) {
      fail("Исходные данные изменились. Повтори проверку и подтверждение.");
    }
    const construction = snapshot.contractContextSnapshot.garmentRequirementsProfile?.constructionIdentity;
    if (!["seamed_set_in_sleeve", "top_down_raglan"].includes(construction)) fail("Для этой конструкции расчёт ещё не поддержан.");
    const manufacturer = artifact.gauge.source === "manufacturer";
    const gauge = root.YarnAIManualCalculationIntake.gaugeBasis(artifact.gauge);
    const stitchRate = positive(gauge.stitches, "петли образца") / positive(gauge.widthCm, "ширина образца");
    const rowRate = positive(gauge.rows, "ряды образца") / positive(gauge.heightCm, "высота образца");
    if (!manufacturer && gauge.afterTreatment !== "yes") fail("Нужна плотность после стирки и сушки образца.");
    const inputs = snapshot.normalizedInputs;
    const m = (key) => positive(inputs.measurements[key]?.valueCm, key);
    const rows = [];
    function count(key, label, divisor, unit, factor = 1) {
      const cm = m(key) / divisor;
      const rate = unit === "п." ? stitchRate : rowRate;
      const exact = cm * rate;
      const rounded = factor * Math.round(exact / factor);
      if (!Number.isSafeInteger(rounded) || rounded <= 0) fail(`Размер слишком мал или велик: ${label}.`);
      rows.push({ key, label, targetCm: cm, exact, value: rounded, unit,
        resultingCm: rounded / rate, deviationCm: rounded / rate - cm,
        formula: `${m(key)}${divisor === 1 ? "" : ` ÷ ${divisor}`} × ${unit === "п." ? gauge.stitches : gauge.rows} ÷ ${unit === "п." ? gauge.widthCm : gauge.heightCm}`,
        rounding: factor === 2 ? "До ближайшего чётного; ровно посередине — вверх" : "До ближайшего целого; ровно посередине — вверх",
        sources: [`confirmedSnapshot.normalizedInputs.measurements.${key}`, manufacturer ? `intake.gauge.label.${unit === "п." ? "stitchesPer10Cm" : "rowsPer10Cm"}` : `intake.gauge.sourceMeasurement.${unit === "п." ? "stitches/widthCm" : "rows/heightCm"}`] });
    }
    if (m("finished_neck_width") >= m("finished_bust_circumference") / 2) fail("Ширина горловины должна быть меньше ширины детали корпуса.");
    if (m("finished_cuff_circumference") > m("finished_upper_arm_circumference")) fail("Обхват манжеты больше обхвата верха рукава: нужна отдельная конструкция рукава.");
    if (construction === "seamed_set_in_sleeve") {
      if (m("finished_armhole_depth") >= m("finished_body_length")) fail("Глубина проймы должна быть меньше длины корпуса.");
      count("finished_bust_circumference", "Ширина переда / спинки в основном полотне", 2, "п.", 2);
      count("finished_armhole_depth", "Высота проймы в рядах основного полотна", 1, "р.");
    } else {
      count("finished_bust_circumference", "Обхват корпуса в основном полотне", 1, "п.", 2);
      count("finished_yoke_depth", "Глубина кокетки в рядах основного полотна", 1, "р.");
    }
    count("finished_body_length", "Полная длина корпуса в рядах основного полотна", 1, "р.");
    count("finished_sleeve_length", "Длина рукава в рядах основного полотна", 1, "р.");
    count("finished_upper_arm_circumference", "Обхват верха рукава в основном полотне", 1, "п.", 2);
    count("finished_cuff_circumference", "Обхват манжеты в пересчёте на основное полотно", 1, "п.", 2);
    count("finished_neck_width", "Ширина горловины в основном полотне", 1, "п.", 2);
    count("finished_front_neck_depth", "Глубина передней горловины в рядах основного полотна", 1, "р.");
    return Object.freeze({ version: VERSION, status: "PARTIAL", ...(manufacturer ? { gaugeStatus: "Расчёт по плотности производителя" } : {}), executable: false,
      sourceFingerprint: snapshot.fingerprint, intakeFingerprint: artifact.fingerprint,
      construction, yarn: inputs.yarn, needles: inputs.needles, rows,
      limitations: [
        "Это перевод подтверждённых размеров в петли и ряды основного полотна, ещё не инструкция для начала вязания.",
        "Кромочные, припуски на швы и раппорт узора сюда не добавлены. Плотность резинки, планки и воротника может отличаться.",
        construction === "seamed_set_in_sleeve"
          ? "Этот предварительный перевод не определяет контуры проймы, плеча и оката. Для прямого поло форма рассчитывается и подтверждается в следующем разделе; там учтены кромочные и пары рядов."
          : "Не рассчитаны начальное распределение петель, росток и расписание регланных прибавок.",
        "Для поло нужны также выбранная форма разреза и отдельные расчёты планки, петель для пуговиц и воротника.",
        "Расход пряжи и достаточность запаса не определены: нужен вес обработанного образца и полный расчёт площадей деталей."
      ] });
  }
  const api = Object.freeze({ VERSION, build });
  root.YarnAIGarmentCalculationPreview = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
