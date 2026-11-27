"use strict";

(function exposePersonalFit(root) {
  const geometry = root.YarnAIGarmentSetInGeometry || require("./garment-set-in-geometry.js");
  // Bounds describe the adult garment and catch common cm/mm and half-width errors.
  const groups = {
    body: "Мерки тела, см",
    design: "Размеры изделия и свобода, см",
    gauge: "Плотность на 10 см",
  };
  // key, label, minimum, maximum, guidance, group, optional
  const fields = [
    ["chest","Обхват груди",55,210,"Обведи ленту вокруг самой полной части груди и лопаток. Дыши спокойно, держи ленту горизонтально.","body"],
    ["belly","Обхват живота",50,230,"Обведи самое выступающее место живота, не втягивай его. Отметь этот уровень.","body"],
    ["hem","Обхват на уровне низа",50,230,"Отметь будущий низ. Обведи тело на этой высоте, проверь в зеркале горизонтальность ленты.","body"],
    ["waist","Обхват талии",45,220,"Для отдельного контура талии обведи естественную талию свободно и укажи её высоту от низа.","body",true],
    ["shoulders","Ширина плеч",25,70,"По спине от конца одного плеча до другого. Сними горизонтальную ширину, не веди ленту вокруг рук.","body"],
    ["upper","Обхват руки вверху",16,85,"Обведи самую широкую часть расслабленной руки. Лента касается кожи без натяжения.","body"],
    ["wrist","Обхват запястья",10,35,"Обведи запястье там, где закончится манжета. Оставь свободу для отдельного поля.","body"],
    ["head","Обхват головы",40,72,"Обведи лоб над бровями и самое выступающее место затылка. Запиши полный круг.","body"],
    ["length","Длина изделия",30,115,"По хорошо сидящей вещи от верхней точки плеча у шеи вертикально до выбранного низа, без воротника.","design"],
    ["bellyHeight","Высота линии живота от низа",1,85,"От отмеченного низа подними ленту вертикально до отметки самого полного места живота.","design"],
    ["waistHeight","Высота талии от низа",1,85,"По вертикали от того же низа до естественной талии. Заполни вместе с её обхватом.","design",true],
    ["depth","Глубина проймы",8,48,"От верхней точки плеча у шеи вертикально до уровня подмышечного шва удобной вещи. Не измеряй по кривой проймы.","design"],
    ["arm","Длина рукава под рукой",15,85,"От подмышечного шва до края манжеты вдоль внутреннего шва удобного рукава. Окат в эту длину не входит.","design"],
    ["neckWidth","Ширина выреза до отделки",12,34,"По любимому джемперу измерь от внутреннего конца одного плечевого шва до другого по прямой. Без выбора сохраняется ширина Anthony 20,32 см.","design",true],
    ["neckDepth","Глубина выреза переда до отделки",3,25,"Положи вещь ровно. Измерь вертикаль от линии верхних точек плеч до центра выреза. Без выбора сохраняется авторский участок 5,08 см плюс высота плечевого скоса.","design",true],
    ["bodyEase","Свобода по корпусу",0.1,55,"Сколько сантиметров добавить к полному обхвату груди и нижнего края. Для талии используется та же прибавка.","design"],
    ["bellyEase","Свобода по животу",0.1,55,"Сколько сантиметров добавить к полному обхвату живота. Можно выбрать больше свободы, чем по груди.","design"],
    ["upperEase","Свобода руки вверху",0.1,30,"Добавка к полному обхвату верхней части руки для движения.","design"],
    ["wristEase","Свобода манжеты",0,20,"Добавка к обхвату запястья в спокойном состоянии. Проход кисти проверь на образце резинки.","design"],
    ["labelSt","Этикетка · петли",3,80,"Число петель глади в 10 см по горизонтали на этикетке.","gauge",true],
    ["labelRows","Этикетка · ряды",4,110,"Число рядов глади в 10 см по вертикали на этикетке.","gauge",true],
    ["sampleSt","Обработанная гладь · петли",3,80,"Измерь 10 см в середине высохшего образца поперёк петель без растяжения.","gauge",true],
    ["sampleRows","Обработанная гладь · ряды",4,110,"На том же высохшем образце посчитай ряды в 10 см по вертикали.","gauge",true],
    ["ribSt","Обработанная резинка · петли",3,100,"На спицах для низа и манжет посчитай петли в 10 см высохшей резинки 1 × 1 без растяжения.","gauge",true],
    ["ribRows","Обработанная резинка · ряды",4,120,"Посчитай ряды по высоте 10 см той же резинки после обработки.","gauge",true],
  ];
  const present = value => value !== "" && value != null;
  const even = n => 2 * Math.round(n / 2);
  const odd = n => 1 + even(n - 1);
  const oddUp = n => 1 + 2 * Math.ceil((n - 1) / 2 - 1e-9);
  function check(condition, message) {
    if (!condition) throw Object.assign(new Error(message), {userMessage:message});
  }
  function collect(input) {
    const errors = [], v = {};
    for (const [key,label,min,max,, ,optional] of fields) {
      if (!present(input[key])) {
        if (!optional) errors.push("Укажи «" + label + "».");
        continue;
      }
      const n = Number(input[key]);
      if (!["string","number"].includes(typeof input[key]) || !Number.isFinite(n) || n < min || n > max)
        errors.push(label + " — допустимо от " + min + " до " + max + ". Проверь единицы и полный обхват.");
      else v[key] = n;
    }
    if (input.units !== "cm-full") errors.push("Подтверди сантиметры, полные обхваты тела и ширину плеч между двумя точками.");
    if (!["label","swatch"].includes(input.basis)) errors.push("Выбери источник плотности.");
    const swatch = input.basis === "swatch" || present(input.sampleSt) || present(input.sampleRows);
    if (swatch && !(v.sampleSt && v.sampleRows)) errors.push("Для обработанного образца нужны петли и ряды глади на 10 см.");
    if (!swatch && !(v.labelSt && v.labelRows)) errors.push("Для этикетки нужны петли и ряды глади на 10 см.");
    if (!!v.waist !== !!v.waistHeight) errors.push("Для линии талии укажи и обхват, и высоту от низа.");
    return {errors,v,swatch};
  }
  function shape(start, end, rows, label, reservedRows=0) {
    const pairs = (end - start) / 2, slots = Math.floor((rows-reservedRows) / 2);
    check(Number.isInteger(pairs) && rows >= 2 && Math.abs(pairs) <= slots,
      label + " — для парных прибавок или убавок не хватает лицевых рядов. Проверь длины, обхваты и плотность.");
    const changes = slots ? geometry.spread(Math.abs(pairs),slots) : [];
    return {pairs,rows,changeRows:changes.flatMap((n,i)=> n ? [reservedRows+2*i+1] : [])};
  }
  function checkShoulders(back,front) {
    check(back.length === front.length && back.every((n,i)=>Number.isInteger(n) && n > 0 && n === front[i]),
      "Плечевые швы переда и спинки расходятся. Проверь распределение горловины и ширину плеч.");
  }
  function calculate(input, sizes) {
    const {errors,v,swatch} = collect(input);
    if (errors.length) return {errors};
    try {
      check(sizes?.length && sizes.every(s=>/^\d+(?:\.\d+)? in$/.test(s)), "Не прочитаны авторские размеры Anthony в дюймах.");
      const s = (swatch ? v.sampleSt : v.labelSt)/10, r = (swatch ? v.sampleRows : v.labelRows)/10;
      const gauge = {stitchesPerCm:s,rowsPerCm:r};
      const ribTarget = 3 * 2.54; // Both hems in the verified publisher PDF.
      const ribRows = v.ribRows ? even(ribTarget*v.ribRows/10) : null;
      const ribHeight = ribRows === null ? ribTarget : ribRows*10/v.ribRows;
      const rib = {rows:ribRows,height:ribHeight,target:ribTarget};
      const warnings = ["Перед и спинка имеют равную ширину. При выступающем животе проверь длину переда и распределение ширины на примерке.",
        "Контуры швов — расчётная ломаная. Совмести метки и измерь обработанные детали до втачивания."];
      if (!swatch) warnings.push("Плотность по этикетке. Размеры предварительные до измерения высохшего образца.");
      if (!v.ribSt) warnings.push("Для наборов манжет и низа нужна горизонтальная плотность резинки.");
      if (!ribRows) warnings.push("Резинку вяжут до замера 7,62 см. Для общего числа рядов нужна её вертикальная плотность.");
      const chest = v.chest + v.bodyEase, belly = v.belly + v.bellyEase, hem = v.hem + v.bodyEase;
      check(chest / 2 > v.shoulders && v.upper > v.wrist, "Проверь полные обхваты груди и руки и ширину плеч. Для втачной проймы готовая деталь должна быть шире плеч.");
      const width = (target,rate=s,round=oddUp) => {
        const fabric = round(target*rate);
        return {target,actual:fabric/rate,stitches:fabric+2,fabric}; // one selvage per sewn edge
      };
      const level = (name,target,height) => ({name,height, row:even((height-ribHeight)*r), ...width(target/2)});
      const body = [{...level("Над нижней резинкой",hem,ribHeight),height:ribTarget},level("Живот",belly,v.bellyHeight)];
      if (v.waist) body.push(level("Талия",v.waist+v.bodyEase,v.waistHeight));
      body.sort((a,b)=>a.height-b.height);
      body.push(level("Грудь у начала проймы",chest,v.length-v.depth));
      check(body[0].row===0 && body[0].name==="Над нижней резинкой", "Линия живота и талии должна лежать выше резинки.");
      for (let i=1;i<body.length;i++) body[i].shaping = shape(body[i-1].stitches,body[i].stitches,body[i].row-body[i-1].row,body[i].name,i===1?2:0);
      if (body.some(p=>p.shaping?.pairs)) warnings.push("У Anthony прямые бока. В этой адаптации ширина меняется между указанными уровнями.");
      const underarm = body.at(-1), shoulders = width(v.shoulders,s,odd);
      const armRows = even(v.depth*r)-6; // original shoulder closes in three pairs of rows
      const indent = (underarm.fabric-shoulders.fabric)/2, initial = Math.max(1,Math.round(indent/2));
      const dec = indent-initial, straight = armRows-2-2*dec;
      check(indent>=2 && dec>=1 && straight>=0, "Глубина или ширина проймы несовместима с плечами. Для подмышки и парных убавок нужны свободные ряды.");
      const lower = geometry.edgeLengthCm(initial,2,gauge,true)+geometry.edgeLengthCm(dec,2*dec,gauge);
      const armhole = {initial,dec,straight,rows:armRows,lowerCurveCm:lower,outerHeightCm:armRows/r,perimeterCm:2*(lower+straight/r)};
      const neckWidth = v.neckWidth ?? 8*2.54, neckSt = odd(neckWidth*s);
      const neckDec = Math.max(1,Math.round((neckSt-1)*6/40));
      const depthTarget = v.neckDepth ?? (2*2.54+6/r);
      const neckRows = even(depthTarget*r)-6;
      const center = neckSt-2*neckDec;
      check(center>0 && neckRows>=2*neckDec+2 && neckRows<=straight, "Для круглой горловины Anthony не хватает прямых рядов после проймы.");
      const backShoulder = (shoulders.stitches-neckSt)/2;
      const frontShoulder = (underarm.stitches-2*indent-center)/2-neckDec;
      check(backShoulder>=3 && frontShoulder>=3, "Горловина оставляет слишком мало петель для плечевого шва.");
      const shoulderGroups = geometry.spread(backShoulder,3);
      checkShoulders(shoulderGroups,geometry.spread(frontShoulder,3));
      const neckDepth = (neckRows+6)/r, opening = neckSt/s+center/s+2*Math.hypot(neckDec/s,neckDepth);
      const neck = {target:neckWidth,actual:neckSt/s,stitches:neckSt,center,dec:neckDec,rows:neckRows,depth:neckDepth,depthTarget,opening};
      warnings.push((opening < v.head ? "В покое контур горловины меньше обхвата головы. " : "")+"Проход головы зависит от растяжения отделки и закрытого края. Проверь образец отделки.");
      const cuff = width(v.wrist+v.wristEase), upper = width(v.upper+v.upperEase);
      const sleeveRows = even((v.arm-ribHeight)*r);
      check(upper.fabric>=cuff.fabric,"Манжета шире верхней части рукава. Для Anthony нужна другая форма.");
      const increases = shape(cuff.stitches,upper.stitches,sleeveRows,"Рукав от манжеты до оката",2);
      const nearest = sizes.map(size=>({size,cm:parseFloat(size)*2.54})).reduce((a,b)=>Math.abs(a.cm-chest)<=Math.abs(b.cm-chest)?a:b);
      // 2 inches is a design target for the top edge, within the publisher's 1¾–3½ inch range.
      const top = odd(2*2.54*s);
      const cap = geometry.sleeveCap(upper.fabric,initial,top,gauge,armhole,{capEaseCm:0,neutralContour:true});
      function ribWidth(target, main) {
        if (!v.ribSt) return null;
        const w = width(target,v.ribSt/10);
        const change = main.stitches-w.stitches;
        check(Math.abs(change)<=Math.min(w.fabric-1,main.fabric-1),"На переходе от резинки к глади слишком много изменений для одного ряда. Проверь обе плотности.");
        return {...w,change};
      }
      const hemRib = ribWidth(hem/2,body[0]), cuffRib = ribWidth(cuff.target,cuff);
      if (hemRib?.change || cuffRib?.change) warnings.push("При переходе между резинкой и гладью потребуется изменить число петель.");
      return {errors:[],warnings,source:swatch?"swatch":"label",gauge,rib,body,shoulders,shoulderGroups,armhole,neck,
        cuff,upper,sleeveRows,increases,cap,hemRib,cuffRib,nearest,head:v.head,
        length:ribHeight+underarm.row/r+(armRows+6)/r,armLength:ribHeight+sleeveRows/r};
    } catch (error) {
      if (!error.userMessage) throw error;
      return {errors:[error.userMessage]};
    }
  }
  const api = {fields,groups,calculate,checkShoulders};
  root.YarnAIAnthonyPersonalFit = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
