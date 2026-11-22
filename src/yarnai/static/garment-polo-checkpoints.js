"use strict";

(function exposePoloCheckpoints(root) {
  const vision = root.YarnAIPatternExecutionVisionReview || require("./pattern-execution-vision-review.js");
  const modes = ["experienced", "beginner"];
  const fingerprint = value => root.YarnAIGarmentPoloPlan.fingerprint(value);

  // Conditions refer to knitted rows in the current step, excluding the cast-on.
  function forStep(step, design, mode, records = []) {
    if (!modes.includes(mode)) throw new Error("Неизвестный режим фотопроверки.");
    const result = [];
    const {geometry, finishing} = design;
    const end = step.rows?.length || 0;
    function point(id, expected, view, risk, checks, options = {}) {
      if (options.guided && mode !== "beginner") return;
      const row = options.row ?? end;
      if (row < 0 || row > end) return;
      const requirements = [
        "Разложи деталь без растяжения лицевой стороной вверх. Сними сверху без наклона. Оставь края открытыми, убери руки из кадра.",
        view,
        options.scale ? "Покажи ноль и деления сантиметра в плоскости детали. При необходимости добавь второй снимок с обоими концами измерения." :
          "Линейка не нужна. Если детали не различимы на общем виде, добавь крупный снимок указанного участка.",
      ];
      result.push({id:step.id + "." + id, row, expected, risk, requirements, checks,
        manual: options.manual || "Сверь деталь с описанием шага и контрольными измерениями.",
        allowManual: mode === "experienced" && !!options.manual});
    }
    if (["back_rib","front_rib","sleeve1_rib","sleeve2_rib"].includes(step.id)) {
      const height=(step.id.startsWith("sleeve")?finishing.cuff:finishing.hem).heightCm;
      point("rib", "Видна прямоугольная полоса резинки 1×1 без клина, расширений и сужений. Ориентир высоты после обработки " +
        root.YarnAIGarmentPoloPlan.fmt(height) + " см. От наборного края до спицы по шкале проверь только явный недовяз или перевяз. При пограничной разнице запроси замер. Точный счёт рядов выполняет человек.",
        "Покажи всю полосу на спице и вертикальный сантиметр с нулём у наборного края. Если деления или рисунок резинки мелкие, добавь крупный снимок от набора до спицы.",
        "До перехода на гладь проверь рисунок и высоту резинки.", ["overall_step_state","construction_detail","visible_length"],
        {scale:true,guided:step.id !== "back_rib", manual:"Пересчитай ряды одного столбика от набора до спицы и проверь чередование 1×1."});
    }
    if (["back_main","front_main"].includes(step.id)) {
      const row = geometry.body.armhole.events[0].row - finishing.body.geometryRowOffset - 1;
      point("before_armhole", "Боковые края ещё прямые, убавления проймы не начаты. Связано " + row + " рядов глади. Ориентир длины глади по плотности " + root.YarnAIGarmentPoloPlan.fmt(row / geometry.gauge.rowsPerCm) + " см. Проверь только грубую разницу длины.",
        "Покажи всю деталь с сантиметром вдоль глади от верха резинки до спицы.", "До первого закрытия проймы проверь длину корпуса.", ["overall_step_state","visible_length"], {row,scale:true,guided:true});
      point("shape", step.id === "front_main" ? "Перед с центральным разрезом, двумя проймами, горловиной и двумя плечами." :
        "Спинка с двумя проймами, вырезом горловины и двумя плечевыми скосами без переднего разреза.",
        "Покажи всю деталь и оба плеча в одном кадре.", "До обработки и сшивания проверь симметрию и вырез.", ["overall_step_state","edge"]);
    }
    if (/^sleeve[12]_main$/.test(step.id)) {
      point("before_cap", "Рукав расширен от манжеты до начала оката. Ни одна сторона оката ещё не закрыта. Ориентир длины глади " + root.YarnAIGarmentPoloPlan.fmt(finishing.sleeve.beforeCapRows / geometry.gauge.rowsPerCm) + " см.",
        "Сними весь рукав с сантиметром от верхнего края манжеты до спицы.", "До убавлений оката проверь длину и направление расширения.", ["overall_step_state","visible_length"],
        {guided:true,row:finishing.sleeve.beforeCapRows,scale:true});
    }
    if (/^sleeve[12]_close$/.test(step.id)) point("cap","Окат имеет два склона и закрытую вершину.", "Покажи весь рукав, оба склона и верхний край.", "Проверь форму до обработки и вшивания.",["overall_step_state","edge"]);
    if (step.id === "shoulders") point("shoulders","Оба плечевых шва соединены от проймы до горловины без заметного смещения.", "Покажи оба шва и вырез, затем крупно стык краёв.", "Проверь плечи до набора планок.",["edge","construction_detail"],{guided:true});
    const side = records.find(r => r.stepId === "prepare")?.input?.upperBand;
    if (["lower_pickup","upper_pickup"].includes(step.id)) {
      const right = (side === "A") === (step.id === "upper_pickup");
      point("side","Петли подняты по " + (right ? "правому" : "левому") + " краю разреза при взгляде на перед снаружи.", "Покажи весь разрез лицом вверх со спицей в поднятых петлях.", "Проверь сторону до вязания планки.",["construction_detail"],{guided:true});
    }
    if (step.id === "upper_rib") point("holes", "Верхняя планка на " + (side === "A" ? "правом" : "левом") + " краю переда имеет " + finishing.input.buttonCount + " различимых отверстий.", "Сними весь перед и крупно планку с раскрытыми отверстиями.", "Проверь отверстия до закрытия петель.",["construction_detail"]);
    if (step.id === "bands_measure") point("overlap","Планка с отверстиями лежит поверх нижней, нижние концы совмещены.", "Покажи застёжку целиком и крупно её основание.", "Проверь нахлёст до набора воротника.",["construction_detail","edge"]);
    if (step.id === "collar_close") point("collar","Воротник отогнут наружу, концы сходятся у планок, край лежит ровно.", "Сними горловину и обе планки целиком.", "Проверь воротник до сборки корпуса.",["construction_detail","edge"]);
    if (step.id === "sleeve_fit") point("placement","Оба оката разложены у соответствующих пройм, отмеченные середины совпадают с плечами.", "Положи оба рукава у пройм и покажи плечевые метки. Вторым фото покажи совмещение крупно.", "Проверь ориентацию до первого стежка вшивания.",["marker_position","overall_step_state"]);
    if (step.id === "attach_sleeves") point("seams","Оба рукава вшиты. Вершины окатов на плечах, у пройм нет видимых складок и перекоса.", "Разверни изделие до боковых швов, покажи обе проймы и крупно шов оката.", "Проверь вшивание до закрытия боков.",["construction_detail","edge"]);
    if (step.id === "buttons") point("garment","У готового поло два рукава, ровные бока, воротник и застёгивающиеся планки.", "Сними изделие целиком в застёгнутом виде. Покажи оба рукава и линию низа.", "Проверь сборку до окончательной обработки и примерки.",["overall_step_state","construction_detail"]);
    return result;
  }

  function identity(state, step, point) {
    const revision=state.photoControl.pointRevisions?.[point.id] ?? state.photoControl.revision;
    return {projectId:state.projectId, sessionId:state.photoControl.sessionId,
      sessionRevision:revision, planId:state.calculationId,
      planRevision:1, planFingerprint:state.planFingerprint, actionId:step.id, stepId:step.id,
      stepRevision:revision, checkpointIdentity:{checkpointId:point.id,
        revision:1, fingerprint:fingerprint({step:step.fingerprint, point})}};
  }
  function matches(review, state, step, point) {
    return vision.canonicalize(review?.identity) === vision.canonicalize(identity(state,step,point));
  }
  function passed(review, state, step, point) {
    if (!matches(review,state,step,point)) return false;
    if (point.allowManual && review.status === "self_confirmed") return true;
    if (review.status !== "verified_continue" || !review.response) return false;
    try {
      const verdict=vision.validateSanitizedVerdict(review,review.response);
      return verdict.verdict==="verified_continue" && verdict.confidence?.level==="high" &&
        verdict.confidence.uncertainty_reasons?.length===0 && !verdict.missing_evidence.length &&
        point.checks.every(check=>verdict.observations.some(o=>o.check===check && o.finding?.trim() &&
          o.reliability==="visible_reliable" && review.photos.some(p=>p.sha256===o.photo_sha256)));
    }
    catch { return false; }
  }
  function pending(view) {
    if (!view.state?.photoControl || !view.current) return [];
    const step = view.plan.steps[view.state.stepIndex];
    if (!step) return [];
    return forStep(step,view.design,view.state.photoControl.mode,view.state.records).filter(point =>
      !view.state.photoControl.reviews.some(review => passed(review,view.state,step,point)));
  }
  root.YarnAIPoloCheckpoints = Object.freeze({forStep,identity,matches,passed,pending,modes});
  if (typeof module !== "undefined") module.exports = root.YarnAIPoloCheckpoints;
})(typeof window !== "undefined" ? window : globalThis);
