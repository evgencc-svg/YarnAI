"use strict";

(function exposePatternSourceInstructionEvidence(globalObject) {
  const PROGRESS_KIND = "SOURCE_PATTERN_INSTRUCTION_EVIDENCE";
  const SCHEMA_ID = "SOURCE_PATTERN_INSTRUCTION_EVIDENCE_V1";
  const CONTRACT_VERSION = 1;
  const RESULT_VERSION = 1;
  const ALGORITHM_VERSION = "pdf-text-layer-source-instructions:v1";
  const SIZE_SELECTION_ALGORITHM = "canonical-size-vector-selection:v2";
  const STATUSES = Object.freeze(["waiting", "extracting", "draft", "ready_to_confirm", "confirmed", "stale", "failed"]);
  const CONSTRUCTION_SEQUENCE = Object.freeze(["neckline", "yoke", "sleeve_body_separation", "body", "sleeves", "finishing"]);
  const AUDIT_LIMIT = 24;
  const EXCERPT_LIMIT = 360;
  const activeProjects = new Set();

  const SECTION_PATTERNS = Object.freeze([
    { component: "sleeve_body_separation", expression: /(?:separate|separation of|dividing for)\s+(?:the\s+)?(?:sleeves?\s+and\s+body|body\s+and\s+sleeves?)\s*:/gi },
    { component: "neckline", expression: /(?:neckline|neck edge|collar)\s*:/gi },
    { component: "yoke", expression: /yoke\s*:/gi },
    { component: "body", expression: /body\s*:/gi },
    { component: "sleeves", expression: /(?<!short\s)(?<!long\s)(?<!3\/4\s)sleeves?\s*:/gi },
    { component: "finishing", expression: /finishing\s*:/gi },
  ]);
  const BLOCK_DETECTOR = /(?:^|\s)(ribbing\s+(?:first|last)\s+method|neckline\s+increase\s+round|marker\s+set-up|round\s+\d+|short\s+row\s+\d+(?:\s*\([^)]*\))?|next\s+round|shift\s+BOR|separation\s+round|set-up\s+round|decrease\s+round|regular\s+length|cropped\s+length|regular\s+and\s+cropped\s+lengths|short\s+sleeves|3\/4\s+sleeves|long\s+sleeves|neckline\s+ribbing|all\s+sizes)\s*:/gi;

  class SourceInstructionEvidenceError extends Error {
    constructor(code, userMessage, details = {}) {
      super(userMessage);
      this.name = "SourceInstructionEvidenceError";
      this.code = code;
      this.userMessage = userMessage;
      this.details = copy(details);
    }
  }

  function canonicalize(value) {
    if (Array.isArray(value)) return `[${value.map(canonicalize).join(",")}]`;
    if (value && typeof value === "object") return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalize(value[key])}`).join(",")}}`;
    if (typeof value === "number" && !Number.isFinite(value)) throw evidenceError("INVALID_NUMBER", "Evidence содержит недопустимое число.");
    return JSON.stringify(Object.is(value, -0) ? 0 : value);
  }

  function fingerprint(value) {
    const input = canonicalize(value);
    let hash = 0x811c9dc5;
    for (let index = 0; index < input.length; index += 1) {
      hash ^= input.charCodeAt(index);
      hash = Math.imul(hash, 0x01000193) >>> 0;
    }
    return `fnv1a32:${hash.toString(16).padStart(8, "0")}`;
  }

  function stableId(prefix, payload) { return `${prefix}:${fingerprint(payload).slice(8)}`; }
  function normalizeText(value) { return String(value || "").replace(/\r\n?/g, "\n").replace(/[\u00a0\t]+/g, " ").replace(/\s+/g, " ").trim(); }
  function normalizeSizeLabel(value) { return normalizeText(value).replace(/^Adult\s+/i, "").trim(); }

  function parseCanonicalSizeOrder(textValue) {
    const header = /^\s*sizes?\s*:\s*((?:(?:X{0,3}[SL]|M|\dXL)\s*[-–—]\s*){2,}(?:X{0,3}[SL]|M|\dXL))(?=\s*$)/im.exec(textValue);
    if (header) {
      const labels = header[1].split(/\s*[-–—]\s*/).map((label) => label.toUpperCase());
      if (new Set(labels).size === labels.length) return { labels, raw: header[1], status: "parsed" };
    }
    const text = normalizeText(textValue);
    const match = /sizing\s*:\s*([\s\S]{1,700}?)\.\s*Sizes\s+listed\s+in\s+this\s+order/i.exec(text);
    if (!match) return { labels: [], raw: null, status: "missing" };
    const raw = match[1].trim();
    const unwrapped = raw.replace(/^([^()]+)\s*\((.*)\)$/s, "$1, $2");
    const labels = unwrapped.split(",").map(normalizeSizeLabel).filter(Boolean);
    return { labels, raw, status: labels.length ? "parsed" : "missing" };
  }

  function representationTree(raw) {
    const root = { type: "group", children: [] };
    const stack = [root];
    let token = "";
    const flush = () => {
      const value = token.trim().replace(/^,|,$/g, "").trim();
      if (value) stack.at(-1).children.push({ type: "token", value });
      token = "";
    };
    for (const character of String(raw || "")) {
      if (character === "(") {
        flush();
        const group = { type: "group", delimiter: "parentheses", children: [] };
        stack.at(-1).children.push(group);
        stack.push(group);
      } else if (character === ")") {
        flush();
        if (stack.length > 1) stack.pop();
      } else if (character === ",") {
        flush();
      } else token += character;
    }
    flush();
    return root;
  }

  function numericTokens(raw) {
    // Dashes separate unsigned quantities in a graded series.
    if (/^\d+(?:\.\d+|½)?(?:\s*[-–—]\s*\d+(?:\.\d+|½)?){2,}$/.test(raw)) {
      return [...raw.matchAll(/\d+(?:\.\d+|½)?/g)].map((match) => ({
        raw: match[0], value: Number(match[0].replace("½", ".5")),
        start: match.index, end: match.index + match[0].length,
      }));
    }
    return [...String(raw || "").matchAll(/-?\d+(?:\.\d+)?/g)].map((match) => ({ raw: match[0], value: Number(match[0]), start: match.index, end: match.index + match[0].length }));
  }

  function parseMultiSizeVector(raw, canonicalSizeOrder, selectedSize, options = {}) {
    const order = array(canonicalSizeOrder).map(normalizeSizeLabel);
    const selected = normalizeSizeLabel(selectedSize);
    const tokens = numericTokens(raw);
    const selectedIndex = order.findIndex((label) => label.toLowerCase() === selected.toLowerCase());
    const ambiguousReasons = [];
    if (!order.length) ambiguousReasons.push("CANONICAL_SIZE_ORDER_MISSING");
    if (selectedIndex < 0) ambiguousReasons.push("SELECTED_SIZE_NOT_IN_CANONICAL_ORDER");
    if (tokens.length !== order.length) ambiguousReasons.push("SIZE_VECTOR_LENGTH_MISMATCH");
    const selectedToken = selectedIndex >= 0 && tokens.length === order.length ? tokens[selectedIndex] : null;
    return {
      rawSizeVector: String(raw || "").trim(),
      rawRepresentation: representationTree(raw),
      canonicalSizeOrder: order,
      selectedSizeLabel: selected || null,
      selectedSizeIndex: selectedIndex >= 0 ? selectedIndex : null,
      selectedRawValue: selectedToken?.raw ?? null,
      normalizedValue: selectedToken?.value ?? null,
      unit: options.unit || null,
      selectionAlgorithmVersion: SIZE_SELECTION_ALGORITHM,
      selectionStatus: ambiguousReasons.length ? "ambiguous" : "selected",
      ambiguityReasons: ambiguousReasons,
    };
  }

  function vectorCandidates(textValue, order, selectedSize, inheritedConditionalScope = null) {
    const text = String(textValue || "");
    const candidates = [];
    const series = /(?<![\w.\-–—])\d+(?:\.\d+|½)?(?:\s*[-–—]\s*\d+(?:\.\d+|½)?){2,}(?![\w\-–—])/g;
    for (const match of text.matchAll(series)) {
      const start = match.index;
      const end = start + match[0].length;
      const unit = /^\s*(stitches?|sts?\b|rows?|rounds?|times|cm|mm)\b/i.exec(text.slice(end));
      candidates.push({
        ...parseMultiSizeVector(match[0], order, selectedSize, { unit: normalizeUnit(unit?.[1]) }),
        start, end, context: normalizeText(text.slice(Math.max(0, start - 52), end + 52)),
      });
    }
    const starts = [...text.matchAll(/-?\d+(?:\.\d+)?\s*\(/g)];
    for (const startMatch of starts) {
      const start = startMatch.index;
      if (candidates.some((entry) => start >= entry.start && start < entry.end)) continue;
      const opening = text.indexOf("(", start);
      let depth = 0;
      let end = -1;
      for (let index = opening; index < text.length; index += 1) {
        if (text[index] === "(") depth += 1;
        else if (text[index] === ")") {
          depth -= 1;
          if (depth === 0) { end = index + 1; break; }
        }
      }
      if (end < 0) continue;
      const raw = text.slice(start, end);
      const trailing = text.slice(end, end + 18);
      const unitMatch = /^\s*(sts?|stitches?|rows?|rounds?|times|repeats?|[”"']|inches?|cm|mm|yards?)/i.exec(trailing);
      const discoveredScope = conditionalSizeScope(text.slice(0, start), order, selectedSize) || inheritedConditionalScope;
      const scope = discoveredScope && numericTokens(raw).length === discoveredScope.labels.length ? discoveredScope : null;
      const parsed = parseMultiSizeVector(raw, scope?.labels || order, selectedSize, { unit: normalizeUnit(unitMatch?.[1]) });
      if (scope && !scope.appliesToSelectedSize) {
        parsed.canonicalSizeOrder = copy(order);
        parsed.selectedSizeIndex = order.findIndex((label) => label.toLowerCase() === normalizeSizeLabel(selectedSize).toLowerCase());
        parsed.selectedRawValue = null;
        parsed.normalizedValue = null;
        parsed.selectionStatus = "not_applicable";
        parsed.ambiguityReasons = [];
        parsed.conditionalSizeScope = scope;
      } else if (scope) parsed.conditionalSizeScope = scope;
      if (parsed.rawSizeVector.includes("1x1") || /\b[kp]\d/i.test(raw) || numericTokens(raw).length < 2) continue;
      candidates.push({ ...parsed, start, end, context: normalizeText(text.slice(Math.max(0, start - 52), Math.min(text.length, end + 52))) });
    }
    return deduplicateVectors(candidates);
  }

  function readMeasuredPieces(text, selectedSize) {
    const rules = globalObject.YarnAIPatternSemanticRules || (typeof require === "function" && require("./pattern-semantic-rules.js"));
    text = text.replace(/\r\n?/g, "\n");
    const order = rules?.finishedChestSizes(text) || [];
    if (!order.includes(selectedSize)) return null;
    const headings = [...text.matchAll(/^[ \t]*(BACK|FRONT|SLEEVES?|FINISHING)[ \t]*:?[ \t]*$/gm)];
    if (!headings.length) return null;
    const credit = /^[ \t]*([^\n]{1,100}?)\s*\n[ \t]*Designed by[ \t]+([^\n]+)/im.exec(text);
    const attribution = credit ? { title: credit[1].trim(), author: credit[2].trim() } : null;
    const expected = ["BACK", "FRONT", "SLEEVES", "FINISHING"];
    const sections = [];
    const warnings = [];
    function project(passage, vectors) {
      const vector = /(?<![\w./])\d+(?:\.\d+|[¼½¾])?(?:\s*(?:th|st|nd|rd)\b)?\s*\(([^()\n]*(?:\n[^()\n]*){0,6})\)/gi;
      return passage.replace(vector, (raw, inner) => {
        if (!/^\s*(?:\d|[?–—-]\s*,)/.test(inner)) return raw;
        const values = [raw.slice(0, raw.indexOf("(")), ...inner.split(",")].map(s => s.trim());
        const valid = values.length === order.length && values.every(s => /^\d+(?:\.\d+|[¼½¾])?(?:\s*(?:st|nd|rd|th))?$/i.test(s));
        const selectedRawValue = valid ? values[order.indexOf(selectedSize)] : null;
        vectors.push({ rawSizeVector: raw, selectionStatus: valid ? "selected" : "ambiguous", selectedRawValue });
        return selectedRawValue ?? raw;
      });
    }
    const header = text.slice(0, headings[0].index);
    const specifications = [];
    const headerVectors = [];
    const length = /^\s*Length[ \t]*[–—:-][ \t]*(\d[\d.¼½¾]*\s*\([\d.,\s¼½¾]+\)\s*(?:["″”]|cm\b))/im.exec(header);
    if (length) specifications.push("Длина изделия — " + project(length[1], headerVectors).trim());
    const balls = /^\s*(\d+\s*\([\d,\s]+\))\s+(?:balls|skeins)\b/im.exec(header);
    if (balls) specifications.push("Количество мотков — " + project(balls[1], headerVectors));
    for (const [i, heading] of headings.entries()) {
      let passage = text.slice(heading.index + heading[0].length, headings[i + 1]?.index);
      const name = heading[1] === "SLEEVE" ? "SLEEVES" : heading[1];
      if (name === "FINISHING") {
        passage = passage.split(/^\s*(?:standard abbreviations|schematic|\d+[¼½¾]?\s*["″])/im)[0];
        if (attribution && passage.trimEnd().endsWith(attribution.title)) passage = passage.trimEnd().slice(0, -attribution.title.length);
      }
      const vectors = [];
      const projected = project(passage, vectors);
      if (new RegExp("\\bwork as for " + name.toLowerCase() + "\\b", "i").test(projected)) warnings.push("Раздел ссылается на самого себя. Сверь начало детали с поправками автора.");
      sections.push({ heading: name, projected: projected.trim(), vectors });
      if (name === "FINISHING") break;
    }
    for (const name of expected) if (!sections.some(s => s.heading === name)) warnings.push("Отсутствует раздел " + name + ".");
    if (headerVectors.some(v => v.selectionStatus !== "selected")) warnings.push("Размерные значения в характеристиках требуют сверки.");
    return { selectedSize, order, sections, attribution, specifications, warnings, measuredPieces: true };
  }

  function readGradedSource(text, selectedSize) {
    const pieces = readMeasuredPieces(text, selectedSize);
    if (pieces) return pieces;
    const order = parseCanonicalSizeOrder(text);
    if (!order.labels.includes(selectedSize)) return null;
    const start = /^\s*(?:START THE PIECE HERE|NECK EDGE)\s*:/im.exec(text);
    if (!start) return null;
    const heading = /^\s*(NECK EDGE|YOKE|DIVIDING FOR BODY AND SLEEVES|BODY|SLEEVES|DIAGRAM)\s*:\s*$/gim;
    const body = text.slice(start.index);
    const headings = [...body.matchAll(heading)];
    const sections = [];
    for (const [index, match] of headings.entries()) {
      if (match[1].toUpperCase() === "DIAGRAM") break;
      const passage = body.slice(match.index + match[0].length, headings[index + 1]?.index).trim();
      const vectors = vectorCandidates(passage, order.labels, selectedSize).filter((entry) => /[-–—]/.test(entry.rawSizeVector) && !entry.rawSizeVector.includes("("));
      let projected = passage;
      for (const vector of [...vectors].reverse()) {
        if (vector.selectionStatus === "selected") {
          projected = projected.slice(0, vector.start) + vector.selectedRawValue + projected.slice(vector.end);
        }
      }
      sections.push({ heading: match[1].toUpperCase(), projected, vectors });
    }
    if (!sections.some((section) => section.vectors.length)) return null;
    const header = /^([^\n]{1,120})\n(DROPS Design)\s*\n(DROPS \d+-\d+)\b/im.exec(text.slice(0, start.index));
    const attribution = header ? { title: header[1].trim(), author: header[2], number: header[3] } : null;
    return { selectedSize, sections, order: order.labels, attribution };
  }

  // Read the two distinct raglan runs and their declared results before using any counts.
  function readBackShoulderSection(reading) {
    const backs = reading?.sections?.filter(section => section.heading === "BACK");
    if (!reading?.measuredPieces || backs?.length !== 1
        || backs[0].vectors.some(vector => vector.selectionStatus !== "selected")) return null;
    const text = normalizeText(backs[0].projected);
    const parts = text.split(/\bShape Shoulders:\s*/i);
    if (parts.length !== 2) return null;
    // The count and the last row side must refer to the straight section
    // immediately before the shoulders. Never derive either from the holder.
    const entry = /[—–-]\s*(\d{1,4}) sts\.\s*Work even until armholes measure (\d{1,3}(?:[¼½¾]|\.\d+)?\s*["″”])\s*,\s*end on (WS|RS)\.\s*$/i.exec(parts[0]);
    const finish = /^(.*?)\.\s*Slip remaining (\d{1,4}) sts to holder for back neck\.\s*$/i.exec(parts[1]);
    if (!entry || !finish) return null;
    const groups = [];
    const instructions = finish[1].split(/,\s*then\s+/i);
    for (const [index, instruction] of instructions.entries()) {
      const clause = index === 0 ? instruction.replace(/^Bind off\s+/i, "") : instruction;
      if (index === 0 && clause === instruction) return null;
      const group = /^(\d{1,4}) sts at beginning of the next (\d{1,4}) rows$/i.exec(clause);
      if (!group) return null;
      groups.push({ count: Number(group[1]), rows: Number(group[2]) });
    }
    return { startStitches: Number(entry[1]), firstSide: entry[3].toUpperCase() === "WS" ? "RS" : "WS",
      armholeDepth: entry[2].trim(), groups, hold: { count: Number(finish[2]), destination: "back_neck" } };
  }

  function readTwoPhaseRaglan(reading) {
    if (!reading || reading.sections.some((s) => s.vectors.some((v) => v.selectionStatus !== "selected"))) return null;
    const parts = new Map(reading.sections.map((s) => [s.heading, normalizeText(s.projected)]));
    const expectedOrder = ["NECK EDGE", "YOKE", "DIVIDING FOR BODY AND SLEEVES", "BODY", "SLEEVES"];
    if (reading.sections.length !== expectedOrder.length || reading.sections.some((s, i) => s.heading !== expectedOrder[i])) return null;
    const facts = {};
    const missing = [];
    function capture(section, rule, fields) {
      const match = rule.exec(parts.get(section) || "");
      if (!match) { missing.push(...fields); return; }
      fields.forEach((field, i) => { facts[field] = Number(match[i + 1].replace("½", ".5")); });
    }
    const neck = "NECK EDGE", yoke = "YOKE", split = "DIVIDING FOR BODY AND SLEEVES", body = "BODY", sleeve = "SLEEVES";
    capture(neck, /Cast on (\d+) stitches on circular needle size ([\d.]+) mm/i, ["castOn", "ribNeedle"]);
    capture(neck, /knit 1 and purl 1\) for ([\d.½]+) cm/i, ["neckCm"]);
    capture(neck, /after the first (\d+) stitches/i, ["midFrontMarker"]);
    capture(yoke, /needle size ([\d.]+) mm.*?Insert (\d+) markers/i, ["mainNeedle", "markers"]);
    capture(yoke, /count (\d+) stitches \(= sleeve\).*?count (\d+) stitches \(= front piece\).*?count (\d+) stitches \(= sleeve\).*?(\d+) stitches remain after last marker/i, ["firstSleeve", "firstFront", "secondSleeve", "firstBack"]);
    capture(yoke, /every other round[^.]+?(\d+) times in total = (\d+) stitches \(= (\d+) stitches increased/i, ["fullRepeats", "midYoke", "fullDelta"]);
    capture(yoke, /on front piece and back piece on every other round (\d+) more times \(= (\d+) stitches increased[^)]+\) = (\d+) stitches/i, ["bodyRepeats", "bodyDelta", "endYoke"]);
    capture(yoke, /without increase until piece measures ([\d.]+) cm from marker mid front/i, ["yokeCm"]);
    capture(split, /Knit first stitch \(= belongs to back piece\).*?next (\d+) stitches on a thread.*?cast on (\d+) new stitches.*?work (\d+) stitches.*?next (\d+) stitches on a thread.*?cast on (\d+) new stitches.*?last (\d+) stitches/i, ["leftHeld", "leftUnderarm", "front", "rightHeld", "rightUnderarm", "backRemainder"]);
    capture(body, /^= (\d+) stitches/i, ["bodyStart"]);
    capture(body, /piece measures ([\d.]+) cm from division.*?both marker threads.*?= (\d+) stitches decreased.*?every ([\d.]+) cm (\d+) times in total = (\d+) stitches/i, ["firstDecreaseCm", "bodyLoss", "bodyIntervalCm", "bodyDecreaseTimes", "preHem"]);
    capture(body, /until piece measures ([\d.]+) cm from marker mid front/i, ["hemStartCm"]);
    const ribRule = /needles size ([\d.]+) mm.*?knit 1 and purl 1.*?increasing (\d+) stitches evenly on 1st round.*?= (\d+) stitches.*?rib measures ([\d.]+) cm, cast off/i;
    capture(body, ribRule, ["hemNeedle", "hemGain", "hem", "hemCm"]);
    capture(body, /measures ([\d.]+) cm from marker mid front and approx. ([\d.]+) cm from the top of shoulder/i, ["frontLength", "shoulderLength"]);
    capture(sleeve, /Slip (\d+) sleeve stitches.*?size ([\d.]+) mm.*?1 stitch in each of the (\d+) stitches.*?= (\d+) stitches/i, ["heldPickup", "sleeveNeedle", "pickup", "sleeveStart"]);
    capture(sleeve, /when (\d+) round has been worked after division.*?Decrease (\d+) stitches (\d+) times on every other round, then decrease (\d+) stitches (\d+) times every ([\d.½]+) cm = (\d+) stitches/i, ["sleevePlain", "fastLoss", "fastRepeats", "slowLoss", "slowRepeats", "slowCm", "preCuff"]);
    capture(sleeve, /until sleeve measures ([\d.]+) cm from division/i, ["cuffStartCm"]);
    capture(sleeve, ribRule, ["cuffNeedle", "cuffGain", "cuff", "cuffCm"]);
    capture(sleeve, /Sleeve measures approx. ([\d.]+) cm from division/i, ["sleeveLength"]);
    if (missing.length) return { facts, missing, checks: [], valid: false };
    const f = facts;
    const checks = [
      ["Расстановка маркеров", f.firstFront === f.firstBack && f.firstSleeve === f.secondSleeve && f.markers === 4 && f.castOn === f.firstFront + f.firstBack + f.firstSleeve + f.secondSleeve + f.markers],
      ["Первая серия реглана", f.fullDelta === 8 && f.castOn + f.fullDelta * f.fullRepeats === f.midYoke],
      ["Вторая серия реглана", f.bodyDelta === 4 && f.midYoke + f.bodyDelta * f.bodyRepeats === f.endYoke],
      ["Распределение кокетки", f.front === f.firstFront + 2 * (f.fullRepeats + f.bodyRepeats) + 2 && f.leftHeld === f.firstSleeve + 2 * f.fullRepeats && f.leftHeld === f.rightHeld && f.front === f.backRemainder + 1 && f.endYoke === 2 * f.front + 2 * f.leftHeld],
      ["Подрезы корпуса", f.leftUnderarm === f.rightUnderarm && f.bodyStart === 2 * (f.front + f.leftUnderarm)],
      ["Корпус и резинка", f.bodyLoss === 4 && f.preHem === f.bodyStart - f.bodyDecreaseTimes * f.bodyLoss && f.hem === f.preHem + f.hemGain],
      ["Начало рукава", f.heldPickup === f.leftHeld && f.pickup === f.leftUnderarm && f.sleeveStart === f.heldPickup + f.pickup],
      ["Обе серии убавок рукава", f.fastLoss === 2 && f.slowLoss === 2 && f.preCuff === f.sleeveStart - f.fastRepeats * f.fastLoss - f.slowRepeats * f.slowLoss],
      ["Манжета и кратность резинок 1 × 1", f.cuff === f.preCuff + f.cuffGain && [f.castOn, f.hem, f.cuff].every((n) => n % 2 === 0)],
      ["Длины и спицы", f.hemStartCm + f.hemCm === f.frontLength && f.cuffStartCm + f.cuffCm === f.sleeveLength && f.hemStartCm > f.yokeCm && f.shoulderLength >= f.frontLength && f.sleeveNeedle === f.mainNeedle && f.hemNeedle === f.ribNeedle && f.cuffNeedle === f.ribNeedle],
    ];
    const bounded = Object.values(f).every((n) => Number.isFinite(n) && n > 0 && n <= 10000);
    return { facts, missing, checks, valid: bounded && checks.every(([, ok]) => ok) };
  }

  function conditionalSizeScope(prefix, canonicalOrder, selectedSize) {
    const matches = [...String(prefix || "").matchAll(/([A-Za-z0-9/-]+)\s*\(([^()]*)\)\s*(?:only)?\s*:/gi)];
    const match = matches.at(-1);
    if (!match) return null;
    const labels = [match[1], ...match[2].split(",")].map(normalizeSizeLabel).filter(Boolean);
    const canonical = array(canonicalOrder).map(normalizeSizeLabel);
    if (labels.length < 2 || labels.some((label) => !canonical.some((candidate) => candidate.toLowerCase() === label.toLowerCase()))) return null;
    return { labels, raw: normalizeText(match[0].slice(0, match[0].indexOf(":"))), appliesToSelectedSize: labels.some((label) => label.toLowerCase() === normalizeSizeLabel(selectedSize).toLowerCase()) };
  }

  function deduplicateVectors(vectors) {
    const seen = new Set();
    return vectors.filter((entry) => {
      const key = `${entry.start}:${entry.end}:${entry.rawSizeVector}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  function normalizeUnit(value) {
    const unit = String(value || "").toLowerCase();
    if (/^st/.test(unit)) return "stitches";
    if (/^round/.test(unit)) return "rounds";
    if (/^row/.test(unit)) return "rows";
    if (/^(times|repeats?)/.test(unit)) return "repeats";
    if (/^[”"']|inch/.test(unit)) return "in";
    return unit || null;
  }

  function sectionEvents(pageText) {
    const events = [];
    for (const descriptor of SECTION_PATTERNS) {
      descriptor.expression.lastIndex = 0;
      for (const match of pageText.matchAll(descriptor.expression)) events.push({ component: descriptor.component, start: match.index, end: match.index + match[0].length, heading: normalizeText(match[0]).replace(/:$/, "") });
    }
    events.sort((left, right) => left.start - right.start || right.end - left.end);
    return events.filter((entry, index) => !events.slice(0, index).some((prior) => entry.start >= prior.start && entry.end <= prior.end));
  }

  function sourceChunks(pages) {
    const chunks = [];
    let currentComponent = null;
    let currentHeading = null;
    for (const page of pages) {
      const pageText = normalizeText(page.text);
      const events = sectionEvents(pageText);
      let cursor = 0;
      for (const event of events) {
        if (currentComponent && event.start > cursor) chunks.push(chunk(currentComponent, currentHeading, page, pageText, cursor, event.start));
        currentComponent = event.component;
        currentHeading = event.heading;
        cursor = event.end;
      }
      if (currentComponent && cursor < pageText.length) chunks.push(chunk(currentComponent, currentHeading, page, pageText, cursor, pageText.length));
    }
    return chunks.filter((entry) => entry.text);
  }

  function chunk(component, heading, page, pageText, start, end) {
    return { component, heading, pageIndex: integer(page.pageNumber) ? page.pageNumber - 1 : 0, displayedPageNumber: integer(page.pageNumber), pageText, start, end, text: normalizeText(pageText.slice(start, end)) };
  }

  function blockSpans(chunkValue) {
    const text = chunkValue.text;
    const matches = [...text.matchAll(BLOCK_DETECTOR)];
    const spans = [];
    if (!matches.length) return [{ label: null, start: 0, end: text.length, text }];
    if (matches[0].index > 0) spans.push({ label: null, start: 0, end: matches[0].index, text: text.slice(0, matches[0].index).trim() });
    matches.forEach((match, index) => {
      const start = match.index + (/^\s/.test(match[0]) ? 1 : 0);
      const end = index + 1 < matches.length ? matches[index + 1].index : text.length;
      spans.push({ label: normalizeText(match[1]), start, end, text: text.slice(start, end).trim() });
    });
    return spans.filter((entry) => entry.text);
  }

  function classifyInstruction(block, component) {
    const value = block.text.toLowerCase();
    if (component === "finishing" && /weave\s+in|sew\s+up|block\s+(?:the|your)|finishing/.test(value)) return { operationType: "finish", instructionKind: "finishing_operation" };
    if (/cast\s+on/.test(value)) return { operationType: "cast_on", instructionKind: "operation" };
    if (/place.+on\s+hold|held\s+sts/.test(value)) return { operationType: "hold_stitches", instructionKind: component === "sleeve_body_separation" ? "transition" : "operation" };
    if (/pick\s+up/.test(value)) return { operationType: "pick_up_stitches", instructionKind: "operation" };
    if (/bind\s+off/.test(value)) return { operationType: "bind_off", instructionKind: component === "finishing" ? "finishing_operation" : "operation" };
    if (/increase|\bkfb\b/.test(value)) return { operationType: "increase", instructionKind: /total\s+of|work\s+rounds?/.test(value) ? "repeat_block" : "single_round" };
    if (/decrease|\bssk\b|\bk2tog\b/.test(value)) return { operationType: "decrease", instructionKind: /total\s+of|work\s+these/.test(value) ? "repeat_block" : "single_round" };
    if (/until.+measure|until.+length|short\s+of\s+desired/.test(value)) return { operationType: "work_pattern", instructionKind: "measure_until" };
    if (/weave\s+in|sew\s+up|block\s+(?:the|your)|finishing/.test(value)) return { operationType: "finish", instructionKind: "finishing_operation" };
    if (/round\s+\d+|next\s+round|set-up\s+round/.test(value)) return { operationType: "work_pattern", instructionKind: "single_round" };
    if (/short\s+row\s+\d+/.test(value)) return { operationType: "work_pattern", instructionKind: "single_row" };
    if (/work\s+(?:these|rounds?|rows?).+total|repeat/.test(value)) return { operationType: "repeat", instructionKind: "repeat_block" };
    if (/proceed|shift\s+bor|switch\s+to/.test(value)) return { operationType: "transition", instructionKind: "transition" };
    return { operationType: "work_pattern", instructionKind: "operation" };
  }

  function semanticCounts(textValue, vectors) {
    return vectors.map((vector) => {
      const before = normalizeText(textValue.slice(Math.max(0, vector.start - 70), vector.start)).toLowerCase();
      const after = normalizeText(textValue.slice(vector.end, Math.min(textValue.length, vector.end + 45))).toLowerCase();
      let role = "source_value";
      if (/cast\s+on[^.]*$/.test(before)) role = /underarm/.test(`${before} ${after}`) ? "underarm_cast_on" : "cast_on";
      else if (/increas(?:e|ing)[^.]*$/.test(before)) role = "increase_delta";
      else if (/decreas(?:e|ing)[^.]*$/.test(before)) role = "decrease_delta";
      else if (/on\s+hold|held\s+sts|place\s+the?$/.test(before)) role = "held_stitches";
      else if (/pick\s+up|pick\s+up\s+and\s+knit/.test(before)) role = "picked_up_stitches";
      else if (/this\s+is/.test(before)) role = /rows/.test(after) ? "row_count" : "round_count";
      else if (/total\s+of/.test(before) || /^\s*times|repeats/.test(after)) role = "repeat_count";
      else if (/rounds?\s+even/.test(after)) role = "even_rounds";
      else if (/work\s+these[^.]*$/.test(before) && /rounds?\s+a\s+total/.test(after)) role = "decrease_cycle_rounds";
      else if (/sts?\s+at\s+each\s+sleeve/.test(after)) role = "sleeve_stitches";
      else if (/sts?\s+at\s+each\s+front/.test(after)) role = "front_back_stitches";
      else if (/sts?\s+to\s+the\s+next\s+marker\s*\(front\)/.test(after)) role = "front_stitches";
      else if (/body\s+sts?/.test(after)) role = "body_stitches";
      else if (/\[\s*$/.test(before) || /^\s*(?:total\s+)?sts/.test(after)) role = "output_stitches";
      else if (/until.+measure|length/.test(before)) role = "measurement";
      return { role, ...copy(vector) };
    });
  }

  function executionRoleFor(component, labelValue, rawText, context) {
    const label = normalizeText(labelValue).toLowerCase();
    if (component === "neckline" && label === "ribbing first method") return "neckline_ribbing_immediate";
    if (component === "neckline" && label === "ribbing last method") return "neckline_deferred_setup";
    if (component === "neckline" && label === "neckline increase round") return "neckline_increase";
    if (component === "neckline" && /cast\s+on/i.test(rawText)) return "cast_on";
    if (component === "yoke" && label === "marker set-up" && context.shortRowsActive) return "short_row_marker_setup";
    if (component === "yoke" && label === "marker set-up") return "yoke_marker_setup";
    if (component === "yoke" && /^short row [1-4]/.test(label)) return label.replace(/\s*\([^)]*\)/g, "").replace(/\s+/g, "_");
    if (component === "yoke" && label === "next round" && context.shortRowsActive) return "short_row_recovery_round";
    if (component === "yoke" && label === "shift bor") return "short_row_shift_bor";
    if (component === "yoke" && label === "round 1") return "raglan_increase_round";
    if (component === "yoke" && label === "round 2") return "raglan_repeat_block";
    if (component === "yoke" && /check\s+yoke\s+depth/i.test(rawText)) return "yoke_depth_and_short_row_intro";
    if (component === "sleeve_body_separation" && label === "separation round") return "separation";
    if (component === "body" && label === "regular length") return "body_regular_measure";
    if (component === "body" && label === "cropped length") return "body_cropped_measure";
    if (component === "body" && label === "regular and cropped lengths") return "body_lower_ribbing";
    if (component === "sleeves" && label === "set-up round") return "sleeve_setup";
    if (component === "sleeves" && label === "short sleeves") return "sleeve_short";
    if (component === "sleeves" && label === "3/4 sleeves") return "sleeve_three_quarter_start";
    if (component === "sleeves" && label === "long sleeves") return "sleeve_long_start";
    if (component === "sleeves" && label === "decrease round" && context.sleeveBranch === "three_quarter") return "sleeve_three_quarter_decrease";
    if (component === "sleeves" && label === "decrease round" && context.sleeveBranch === "long") return "sleeve_long_decrease";
    if (component === "sleeves" && label === "all sizes") return "sleeve_three_quarter_cuff";
    if (component === "sleeves" && label === "neckline ribbing") return "deferred_neckline_ribbing";
    if (component === "finishing") return "finishing";
    return null;
  }

  function choiceMembershipFor(component, labelValue, executionRole, context) {
    const label = normalizeText(labelValue).toLowerCase();
    const memberships = [];
    if (executionRole === "neckline_ribbing_immediate") memberships.push({ groupId: "neckline_method", optionId: "ribbing_first" });
    if (["neckline_deferred_setup", "deferred_neckline_ribbing"].includes(executionRole)) memberships.push({ groupId: "neckline_method", optionId: "ribbing_last" });
    if (context.shortRowsActive && component === "yoke" && executionRole !== null) memberships.push({ groupId: "short_rows", optionId: "include" });
    if (label === "regular length") memberships.push({ groupId: "body_length", optionId: "regular" });
    if (label === "cropped length") memberships.push({ groupId: "body_length", optionId: "cropped" });
    if (component === "sleeves" && context.sleeveBranch) memberships.push({ groupId: "sleeve_length", optionId: context.sleeveBranch });
    return memberships;
  }

  function createEvidenceUnits(pages, canonicalSizeOrder, selectedSize, binding) {
    const units = [];
    let order = 0;
    const context = { shortRowsActive: false, sleeveBranch: null };
    for (const sourceChunk of sourceChunks(pages)) {
      let activeConditionalScope = null;
      for (const block of blockSpans(sourceChunk)) {
        const rawText = normalizeText(block.text);
        if (rawText.length < 8 || /^FLAX sweater:\s*worsted\/aran\s*\d*\s*www\.tincanknits\.com/i.test(rawText)) continue;
        if (/^all\s+sizes$/i.test(normalizeText(block.label))) activeConditionalScope = null;
        const declaredConditionalScope = conditionalSizeScope(rawText, canonicalSizeOrder, selectedSize);
        const classification = classifyInstruction(block, sourceChunk.component);
        const normalizedLabel = normalizeText(block.label).toLowerCase();
        if (sourceChunk.component === "yoke" && /short\s+row\s+shaping\s*\(optional\)/i.test(rawText)) context.shortRowsActive = true;
        if (sourceChunk.component === "sleeves" && normalizedLabel === "short sleeves") context.sleeveBranch = "short";
        if (sourceChunk.component === "sleeves" && normalizedLabel === "3/4 sleeves") context.sleeveBranch = "three_quarter";
        if (sourceChunk.component === "sleeves" && normalizedLabel === "long sleeves") context.sleeveBranch = "long";
        if (sourceChunk.component === "sleeves" && normalizedLabel === "neckline ribbing") context.sleeveBranch = null;
        const executionRole = executionRoleFor(sourceChunk.component, block.label, rawText, context);
        const vectors = vectorCandidates(rawText, canonicalSizeOrder, selectedSize, activeConditionalScope);
        if (declaredConditionalScope) activeConditionalScope = declaredConditionalScope;
        const criticalAmbiguities = vectors.filter((entry) => entry.selectionStatus === "ambiguous").flatMap((entry) => entry.ambiguityReasons);
        const absoluteStart = sourceChunk.start + block.start;
        const absoluteEnd = Math.min(sourceChunk.pageText.length, sourceChunk.start + block.end);
        const fragmentFingerprint = fingerprint({ sourceDocumentFingerprint: binding.sourceDocumentFingerprint, pageIndex: sourceChunk.pageIndex, start: absoluteStart, end: absoluteEnd, rawText });
        order += 1;
        const unit = {
          identity: stableId("source-instruction", { fragmentFingerprint, component: sourceChunk.component, order }),
          globalOrder: order,
          componentIdentity: `component:${sourceChunk.component}`,
          component: sourceChunk.component,
          operationType: classification.operationType,
          instructionKind: classification.instructionKind,
          executionRole,
          choiceMembership: choiceMembershipFor(sourceChunk.component, block.label, executionRole, context),
          countChange: (() => { const match = rawText.match(/\[(\d+)\s+sts?\s+(inc|dec)/i); return match ? { delta: Number(match[1]) * (match[2].toLowerCase() === "dec" ? -1 : 1), unit: "stitches", source: match[0] } : null; })(),
          label: block.label,
          rawText,
          normalizedInstruction: rawText,
          provenanceKinds: ["SOURCE_EXPLICIT", "SOURCE_NORMALIZED", ...(vectors.some((entry) => entry.selectionStatus === "selected") ? ["SOURCE_SIZE_SELECTED"] : [])],
          sizeSelections: vectors,
          numericValues: semanticCounts(rawText, vectors),
          sourceLocator: {
            pdfPageIndex: sourceChunk.pageIndex,
            displayedPageNumber: sourceChunk.displayedPageNumber,
            sectionHeading: sourceChunk.heading,
            subsectionHeading: block.label,
            textSpan: { start: absoluteStart, end: absoluteEnd },
            supportingExcerpt: rawText.slice(0, EXCERPT_LIMIT),
            fragmentFingerprint,
            boundingBox: null,
            extractionConfidence: criticalAmbiguities.length ? 0.62 : classification.operationType === "work_pattern" && classification.instructionKind === "operation" ? 0.78 : 0.93,
            ambiguityStatus: criticalAmbiguities.length ? "ambiguous" : "clear",
          },
          ambiguities: [...new Set(criticalAmbiguities)].map((code) => ({ code, critical: true })),
        };
        units.push(unit);
        if (executionRole === "short_row_shift_bor") context.shortRowsActive = false;
      }
    }
    return units;
  }

  function createReviewQuestions(units) {
    const allText = units.map((entry) => entry.rawText).join(" ").toLowerCase();
    const questions = [];
    const add = (kind, prompt, options, evidenceUnits) => questions.push({
      identity: stableId("source-review-question", { kind, prompt, options }), kind, prompt,
      required: true, exclusive: true, status: "unresolved", selectedOptionId: null,
      options: options.map((option) => ({ ...option, evidenceUnitIdentities: units.filter((unit) => array(unit.choiceMembership).some((membership) => membership.groupId === kind && membership.optionId === option.id)).map((unit) => unit.identity) })),
      evidenceUnitIdentities: evidenceUnits.map((entry) => entry.identity),
    });
    if (/two\s+ribbing\s+methods|ribbing\s+first\s+method.+ribbing\s+last\s+method/.test(allText)) {
      add("neckline_method", "Когда выполнять резинку горловины?", [{ id: "ribbing_first", label: "Сразу после набора" }, { id: "ribbing_last", label: "После завершения изделия" }], units.filter((entry) => entry.component === "neckline" && /ribbing\s+(first|last)/i.test(entry.rawText)));
    }
    if (/short\s+row\s+shaping\s*\(optional\)|optional\s+short\s+rows/.test(allText)) {
      add("short_rows", "Выполнять необязательные укороченные ряды?", [{ id: "include", label: "Да, выполнить" }, { id: "skip", label: "Нет, пропустить" }], units.filter((entry) => entry.component === "yoke" && /short\s+row/i.test(entry.rawText)));
    }
    if (/regular(?:\s+and\s+cropped)?\s+lengths?/.test(allText) && /cropped\s+lengths?/.test(allText)) {
      add("body_length", "Какую ветку длины корпуса использовать?", [{ id: "regular", label: "Обычная длина" }, { id: "cropped", label: "Укороченная длина" }], units.filter((entry) => entry.component === "body" && /(regular|cropped)\s+length/i.test(entry.rawText)));
    }
    if (/short\s+sleeves?/.test(allText) && /3\/4\s+sleeves?/.test(allText) && /long\s+sleeves?/.test(allText)) {
      add("sleeve_length", "Какую ветку длины рукава использовать?", [{ id: "short", label: "Короткий рукав" }, { id: "three_quarter", label: "Рукав 3/4" }, { id: "long", label: "Длинный рукав" }], units.filter((entry) => entry.component === "sleeves" && /(short|3\/4|long)\s+sleeves/i.test(entry.rawText)));
    }
    return questions;
  }

  function coverageFor(units) {
    const sections = CONSTRUCTION_SEQUENCE.map((component, index) => {
      const matching = units.filter((entry) => entry.component === component);
      const operations = matching.filter((entry) => entry.operationType !== "unknown");
      const rowInstructions = matching.filter(isRowInstruction);
      const finishing = matching.filter((entry) => entry.instructionKind === "finishing_operation");
      const missing = [];
      if (!matching.length) missing.push("component");
      if (!operations.length) missing.push("operations");
      if (!rowInstructions.length && component !== "finishing") missing.push("rowInstructions");
      if (component === "finishing" && !finishing.length) missing.push("finishing");
      return { component, order: index + 1, evidenceUnitIdentities: matching.map((entry) => entry.identity), operationCount: operations.length, rowInstructionCount: rowInstructions.length, finishingCount: finishing.length, complete: missing.length === 0, missing };
    });
    return { requiredCount: sections.length, coveredCount: sections.filter((entry) => entry.complete).length, complete: sections.every((entry) => entry.complete), sections };
  }

  function blockerResolutionMap(units, coverage, status) {
    const confirmed = status === "confirmed";
    const match = (predicate) => units.filter(predicate);
    const rows = [
      ["SOURCE_CAST_ON_INSTRUCTION_MISSING", match((unit) => unit.operationType === "cast_on")],
      ["SOURCE_COMPONENT_INSTRUCTIONS_MISSING", units],
      ["SOURCE_COMPONENT_DIMENSIONS_MISSING", match((unit) => unit.instructionKind === "measure_until")],
      ["SOURCE_SHAPING_INSTRUCTIONS_MISSING", match((unit) => ["increase", "decrease"].includes(unit.operationType))],
      ["SOURCE_SEPARATION_INSTRUCTIONS_MISSING", match((unit) => unit.component === "sleeve_body_separation")],
      ["SOURCE_ROW_INSTRUCTIONS_MISSING", match(isRowInstruction)],
      ["SOURCE_FINISHING_INSTRUCTIONS_MISSING", match((unit) => unit.component === "finishing" && unit.instructionKind === "finishing_operation")],
      ["SOURCE_CONSTRUCTION_COVERAGE_INCOMPLETE", coverage.complete ? units : []],
    ];
    return rows.map(([blocker, evidence]) => ({
      blocker,
      supportingEvidenceIdentities: evidence.map((entry) => entry.identity),
      sourceLocations: evidence.map((entry) => copy(entry.sourceLocator)),
      resolutionStatus: confirmed && evidence.length && (blocker !== "SOURCE_CONSTRUCTION_COVERAGE_INCOMPLETE" || coverage.complete) ? "resolved" : evidence.length ? "draft_supported" : "unresolved",
      remainingAmbiguity: evidence.flatMap((entry) => entry.ambiguities).map((entry) => entry.code),
    }));
  }

  function buildProjection(units) {
    const components = CONSTRUCTION_SEQUENCE.map((component, index) => ({ identity: `component:${component}`, type: component, order: index + 1, sourceEvidenceIdentities: units.filter((entry) => entry.component === component).map((entry) => entry.identity) }));
    const operations = units.map((unit) => ({
      identity: `operation:${unit.identity.slice(unit.identity.indexOf(":") + 1)}`, order: unit.globalOrder, componentIdentity: unit.componentIdentity,
      type: unit.operationType, instructionKind: unit.instructionKind, inputStitchCount: selectedCount(unit, ["input_stitches", "cast_on"]),
      outputStitchCount: selectedCount(unit, ["output_stitches"]), actions: [unit.normalizedInstruction], repeat: repeatProjection(unit),
      measurementCondition: unit.instructionKind === "measure_until" ? unit.normalizedInstruction : null,
      sourceEvidenceIdentities: [unit.identity], sourceLocator: copy(unit.sourceLocator), numericValues: copy(unit.numericValues),
      executionRole: unit.executionRole, choiceMembership: copy(unit.choiceMembership), countChange: copy(unit.countChange),
    }));
    const rowInstructions = operations.filter((entry) => ["single_row", "single_round", "repeat_block", "measure_until"].includes(entry.instructionKind) || /(?:row|round)/i.test(entry.sourceLocator?.subsectionHeading || "")).map((entry) => copy(entry));
    const finishing = operations.filter((entry) => entry.instructionKind === "finishing_operation").map((entry) => copy(entry));
    return { components, operations, rowInstructions, finishing };
  }

  function selectedCount(unit, roles) {
    const value = array(unit.numericValues).find((entry) => roles.includes(entry.role) && entry.selectionStatus === "selected");
    return value?.normalizedValue ?? null;
  }
  function isRowInstruction(unit) { return ["single_row", "single_round", "repeat_block", "measure_until"].includes(unit.instructionKind) || /(?:row|round)/i.test(unit.sourceLocator?.subsectionHeading || unit.label || ""); }
  function repeatProjection(unit) {
    const repeat = array(unit.numericValues).find((entry) => entry.role === "repeat_count" && entry.selectionStatus === "selected");
    return repeat ? { mode: "count", count: repeat.normalizedValue, unit: repeat.unit, sourceVector: copy(repeat) } : null;
  }

  function buildEvidenceResult(input) {
    const pages = array(input?.pages).map((page, index) => ({ pageNumber: integer(page.pageNumber) || index + 1, text: String(page.text || "") }));
    if (!pages.length || !pages.some((page) => normalizeText(page.text))) throw evidenceError("SOURCE_PDF_TEXT_MISSING", "В подтверждённом PDF нет доступного текстового слоя.");
    const combined = pages.map((page) => page.text).join("\n");
    const parsedOrder = parseCanonicalSizeOrder(combined);
    const canonicalSizeOrder = parsedOrder.labels.length ? parsedOrder.labels : array(input.canonicalSizeOrder).map(normalizeSizeLabel);
    const selectedSize = normalizeSizeLabel(input.selectedSize);
    const binding = copy(input.binding);
    const evidenceUnits = createEvidenceUnits(pages, canonicalSizeOrder, selectedSize, binding);
    const coverage = coverageFor(evidenceUnits);
    const reviewQuestions = createReviewQuestions(evidenceUnits);
    const ambiguities = [
      ...evidenceUnits.flatMap((entry) => entry.ambiguities.map((ambiguity) => ({ ...ambiguity, evidenceUnitIdentity: entry.identity }))),
      ...(!canonicalSizeOrder.length ? [{ code: "CANONICAL_SIZE_ORDER_MISSING", critical: true, evidenceUnitIdentity: null }] : []),
      ...(!selectedSize || !canonicalSizeOrder.some((label) => label.toLowerCase() === selectedSize.toLowerCase()) ? [{ code: "SELECTED_SIZE_AMBIGUOUS", critical: true, evidenceUnitIdentity: null }] : []),
    ];
    const projection = buildProjection(evidenceUnits);
    const base = {
      schemaId: SCHEMA_ID, contractVersion: CONTRACT_VERSION, resultVersion: RESULT_VERSION, algorithmVersion: ALGORITHM_VERSION,
      identity: "", fingerprint: "", binding, pageCount: pages.length, canonicalSizeOrder, canonicalSizeOrderRaw: parsedOrder.raw,
      selectedSize, selectedSizeIndex: canonicalSizeOrder.findIndex((label) => label.toLowerCase() === selectedSize.toLowerCase()),
      evidenceUnits, reviewQuestions, ambiguities, coverage, projection,
      blockerResolutionMap: blockerResolutionMap(evidenceUnits, coverage, "draft"),
      counts: countTypes(evidenceUnits, projection),
    };
    base.identity = stableId("source-pattern-instruction-evidence-result", { binding, algorithmVersion: ALGORITHM_VERSION, selectedSize, canonicalSizeOrder });
    base.fingerprint = resultFingerprint(base);
    return deepFreeze(base);
  }

  function countTypes(units, projection) {
    const byKind = {};
    for (const unit of units) byKind[unit.instructionKind] = (byKind[unit.instructionKind] || 0) + 1;
    return { evidenceUnits: units.length, byKind, components: projection.components.length, operations: projection.operations.length, rowInstructions: projection.rowInstructions.length, finishing: projection.finishing.length };
  }
  function resultFingerprint(result) { const payload = copy(result); delete payload.fingerprint; return fingerprint(payload); }

  function createInitialState(binding, now = timestampNow()) {
    requireBinding(binding);
    return {
      id: stableId("source-pattern-instruction-evidence", { projectId: binding.projectId, sourceDocumentIdentity: binding.sourceDocumentIdentity, stage19ReviewIdentity: binding.stage19ReviewIdentity }),
      kind: PROGRESS_KIND, schemaId: SCHEMA_ID, contractVersion: CONTRACT_VERSION, resultVersion: RESULT_VERSION,
      algorithmVersion: ALGORITHM_VERSION, revision: 1, status: "waiting", binding: copy(binding), bindingFingerprint: fingerprint(binding),
      resultIdentity: null, resultFingerprint: null, result: null, reviewDecisions: [], confirmedSnapshot: null,
      confirmedSnapshotFingerprint: null, freshness: "current", unresolvedIssues: [], history: [], audit: [],
      createdAt: now, updatedAt: now, confirmedAt: null, error: null,
    };
  }

  function beginExtraction(state, now = timestampNow()) {
    requireState(state);
    if (state.status === "confirmed") throw evidenceError("CONFIRMED_EVIDENCE_IMMUTABLE", "Подтверждённый snapshot нельзя перестроить на месте.");
    const next = copy(state); next.revision += 1; next.status = "extracting"; next.updatedAt = now; next.error = null; appendAudit(next, "extraction_started", now); return next;
  }

  function completeExtraction(state, result, now = timestampNow()) {
    requireState(state);
    if (state.status !== "extracting") throw evidenceError("EVIDENCE_EXTRACTION_NOT_STARTED", "Извлечение source instructions не было запущено.");
    if (resultFingerprint(result) !== result.fingerprint) throw evidenceError("EVIDENCE_RESULT_FINGERPRINT_INVALID", "Fingerprint результата извлечения не совпадает.");
    const next = copy(state); next.revision += 1; next.result = copy(result); next.resultIdentity = result.identity; next.resultFingerprint = result.fingerprint;
    next.reviewDecisions = result.reviewQuestions.map((question) => ({ questionId: question.identity, selectedOptionId: null, decidedAt: null }));
    next.unresolvedIssues = unresolvedIssues(next); next.status = canConfirm(next) ? "ready_to_confirm" : "draft"; next.updatedAt = now; appendAudit(next, "extraction_completed", now, { resultIdentity: result.identity, resultFingerprint: result.fingerprint }); return next;
  }

  function setReviewDecision(state, questionId, selectedOptionId, now = timestampNow()) {
    requireMutable(state);
    const question = array(state.result?.reviewQuestions).find((entry) => entry.identity === questionId);
    if (!question || !question.options.some((entry) => entry.id === selectedOptionId)) throw evidenceError("REVIEW_OPTION_INVALID", "Выбран неизвестный вариант source instruction.");
    const next = copy(state); const decision = next.reviewDecisions.find((entry) => entry.questionId === questionId);
    decision.selectedOptionId = selectedOptionId; decision.decidedAt = now; next.revision += 1; next.updatedAt = now; next.unresolvedIssues = unresolvedIssues(next); next.status = canConfirm(next) ? "ready_to_confirm" : "draft"; appendAudit(next, "review_decision_changed", now, { questionId, selectedOptionId }); return next;
  }

  function unresolvedIssues(state) {
    const issues = array(state.result?.ambiguities).filter((entry) => entry.critical).map(copy);
    for (const question of array(state.result?.reviewQuestions)) {
      const decision = array(state.reviewDecisions).find((entry) => entry.questionId === question.identity);
      if (question.required && !decision?.selectedOptionId) issues.push({ code: "SOURCE_BRANCH_SELECTION_REQUIRED", critical: true, questionId: question.identity, kind: question.kind });
    }
    if (!state.result?.coverage?.complete) issues.push({ code: "SOURCE_CONSTRUCTION_COVERAGE_INCOMPLETE", critical: true });
    for (const row of array(state.result?.blockerResolutionMap)) if (!row.supportingEvidenceIdentities.length) issues.push({ code: row.blocker, critical: true });
    return stableObjects(issues);
  }

  function canConfirm(state) { return Boolean(state.result && state.freshness === "current" && unresolvedIssues(state).length === 0 && state.result.coverage.complete); }

  function confirmEvidence(state, now = timestampNow()) {
    requireMutable(state);
    if (!canConfirm(state)) throw evidenceError("EVIDENCE_CONFIRM_BLOCKED", "Сначала разрешите обязательные ветки и неоднозначности source instructions.", { unresolvedIssues: unresolvedIssues(state) });
    const next = copy(state); next.revision += 1; next.status = "confirmed"; next.updatedAt = now; next.confirmedAt = now; next.unresolvedIssues = [];
    const selectedOptions = next.reviewDecisions.map((decision) => ({ ...copy(decision), question: copy(next.result.reviewQuestions.find((entry) => entry.identity === decision.questionId)) }));
    const snapshot = {
      schemaId: SCHEMA_ID, contractVersion: CONTRACT_VERSION, resultVersion: RESULT_VERSION, algorithmVersion: ALGORITHM_VERSION,
      evidenceIdentity: next.id, evidenceRevision: next.revision, resultIdentity: next.resultIdentity, resultFingerprint: next.resultFingerprint,
      binding: copy(next.binding), bindingFingerprint: next.bindingFingerprint, selectedOptions,
      canonicalSizeOrder: copy(next.result.canonicalSizeOrder), selectedSize: next.result.selectedSize, selectedSizeIndex: next.result.selectedSizeIndex,
      evidenceUnits: copy(next.result.evidenceUnits), projection: copy(next.result.projection), coverage: copy(next.result.coverage),
      blockerResolutionMap: blockerResolutionMap(next.result.evidenceUnits, next.result.coverage, "confirmed"), confirmedAt: now,
    };
    snapshot.fingerprint = fingerprint(snapshot);
    next.confirmedSnapshot = deepFreeze(snapshot); next.confirmedSnapshotFingerprint = snapshot.fingerprint; appendAudit(next, "confirmed", now, { confirmedSnapshotFingerprint: snapshot.fingerprint }); return next;
  }

  function rebuildFromSource(state, binding, now = timestampNow()) {
    requireState(state); requireBinding(binding);
    const next = createInitialState(binding, now); next.id = state.id; next.revision = state.revision + 1;
    next.history = [...array(state.history), ...(state.confirmedSnapshot ? [{ evidenceRevision: state.revision, resultIdentity: state.resultIdentity, resultFingerprint: state.resultFingerprint, confirmedSnapshot: copy(state.confirmedSnapshot), confirmedSnapshotFingerprint: state.confirmedSnapshotFingerprint, supersededAt: now }] : [])].slice(-AUDIT_LIMIT);
    next.audit = [...array(state.audit), { type: "immutable_rebuild_created", at: now, revision: next.revision, previousResultIdentity: state.resultIdentity }].slice(-AUDIT_LIMIT); return next;
  }

  function markStale(state, reasonCode, now = timestampNow()) { requireState(state); if (state.status === "stale" && state.error?.code === reasonCode) return copy(state); const next = copy(state); next.revision += 1; next.status = "stale"; next.freshness = "stale"; next.updatedAt = now; next.error = { code: reasonCode }; appendAudit(next, "stale", now, { reasonCode }); return next; }

  function currentBindingFromAggregate(aggregate, patternFiles) {
    const project = aggregate?.project;
    const calculation = array(aggregate?.calculations).find((entry) => entry.calculation_id === project?.active_calculation_id);
    const progress = array(aggregate?.progress).filter((entry) => entry.calculation_id === calculation?.calculation_id && entry.epoch === 1);
    const importProgress = progress.find((entry) => entry.kind === "PATTERN_IMPORT");
    const extractionProgress = progress.find((entry) => entry.kind === "PATTERN_CONTENT_EXTRACTION");
    const semanticProgress = progress.find((entry) => entry.kind === "PATTERN_SEMANTIC_ANALYSIS");
    const reviewProgress = progress.find((entry) => entry.kind === "PATTERN_ANALYSIS_REVIEW");
    const sourceReview = reviewProgress?.state;
    const pdfFiles = array(extractionProgress?.state?.result?.files).filter((entry) => entry.mediaType === "application/pdf" && entry.extractionStatus === "extracted" && array(entry.pages).length);
    if (!project || !calculation || !importProgress || !extractionProgress || !semanticProgress || !reviewProgress) throw evidenceError("SOURCE_CHAIN_INCOMPLETE", "Не найдена полная source chain PDF → Stage 19.");
    if (sourceReview.status !== "confirmed" || !sourceReview.confirmedSnapshot) throw evidenceError("STAGE19_NOT_CONFIRMED", "Source instruction evidence требует подтверждённый Stage 19.");
    if (pdfFiles.length !== 1) throw evidenceError("SOURCE_PDF_SELECTION_AMBIGUOUS", "Нужен ровно один PDF с извлечённым текстовым слоем.", { count: pdfFiles.length });
    const pdf = pdfFiles[0]; const metadata = array(patternFiles).find((entry) => entry.material_id === pdf.sourceFileId);
    if (!metadata?.pattern_file_id || !metadata?.checksum) throw evidenceError("SOURCE_DOCUMENT_IDENTITY_MISSING", "Не удалось доказать identity исходного PDF.");
    const stage19Projection = globalObject.YarnAIPatternAnalysisReview?.authoritativeConfirmedSnapshot
      ? globalObject.YarnAIPatternAnalysisReview.authoritativeConfirmedSnapshot(sourceReview)
      : sourceReview.confirmedSnapshot;
    const sourcePatternEvidence = stage19Projection.sourcePatternEvidence || {};
    const adaptation = stage19Projection.userAdaptationProfile || {};
    const selectedSize = normalizeSizeLabel(adaptation.selectedSize?.value || adaptation.selectedSize || sourcePatternEvidence.facts?.selectedSize);
    const constructionSequence = array(sourcePatternEvidence.facts?.construction?.sequence);
    const binding = {
      projectId: project.project_id,
      sourceDocumentIdentity: metadata.pattern_file_id,
      sourceDocumentMaterialId: pdf.sourceFileId,
      sourceDocumentName: pdf.name,
      sourceDocumentFingerprint: `sha256:${String(metadata.checksum).toLowerCase()}`,
      sourceDocumentRevision: importProgress.state.revision,
      sourceExtractionIdentity: extractionProgress.state.id,
      sourceExtractionRevision: extractionProgress.state.revision,
      analysisId: semanticProgress.state.id,
      stage19ReviewIdentity: sourceReview.id,
      stage19AuthoritativeReviewRevision: sourceReview.revision,
      stage19SourceEvidenceFingerprint: sourcePatternEvidence.fingerprint || stage19Projection.authoritativeProjectionFingerprint,
      selectedSourceSize: selectedSize,
      constructionSequence: constructionSequence.length ? constructionSequence : copy(CONSTRUCTION_SEQUENCE),
      extractionAlgorithmVersion: ALGORITHM_VERSION,
    };
    requireBinding(binding);
    return { project, calculation, progress, importProgress, extractionProgress, semanticProgress, reviewProgress, pdf, binding, canonicalSizeOrder: array(sourcePatternEvidence.facts?.availableSizes), selectedSize };
  }

  function inspectAggregate(aggregate, patternFiles = []) {
    let source;
    try { source = currentBindingFromAggregate(aggregate, patternFiles); }
    catch (error) { return { state: "blocked", reasonCode: error.code || "SOURCE_CHAIN_INCOMPLETE", error, evidence: null, source: null, project: aggregate?.project || null, calculation: null }; }
    const evidenceProgress = source.progress.find((entry) => entry.kind === PROGRESS_KIND) || null;
    if (!evidenceProgress) return { state: "creatable", source, evidence: null, evidenceProgress: null, project: source.project, calculation: source.calculation };
    let evidence;
    try { requireState(evidenceProgress.state); evidence = copy(evidenceProgress.state); }
    catch (error) { return { state: "corrupted", reasonCode: error.code, error, source, evidence: null, evidenceProgress, project: source.project, calculation: source.calculation }; }
    const current = canonicalize(evidence.binding) === canonicalize(source.binding);
    return { state: current ? evidence.status : "stale", reasonCode: current ? null : "SOURCE_BINDING_CHANGED", source, evidence, evidenceProgress, project: source.project, calculation: source.calculation };
  }

  async function ensureForProject(repository, projectId) {
    const aggregate = await repository.getProject(projectId); const files = await repository.listPatternFiles(projectId); let inspected = inspectAggregate(aggregate, files);
    if (inspected.state === "blocked" || inspected.state === "corrupted") return inspected;
    if (!inspected.evidence) {
      const initial = createInitialState(inspected.source.binding);
      await repository.ensureCalculationProgress(projectId, inspected.calculation.calculation_id, PROGRESS_KIND, initial, { operationKind: "SOURCE_PATTERN_INSTRUCTION_EVIDENCE_CREATED", projectStage: "source_instruction_evidence_waiting" });
      return inspectAggregate(await repository.getProject(projectId), await repository.listPatternFiles(projectId));
    }
    if (inspected.state === "stale" && inspected.evidence.status !== "stale") {
      const stale = markStale(inspected.evidence, inspected.reasonCode);
      await repository.updateCalculationProgress(projectId, inspected.calculation.calculation_id, PROGRESS_KIND, stale, { baseProgressRevision: inspected.evidenceProgress.revision, operationKind: "SOURCE_PATTERN_INSTRUCTION_EVIDENCE_STALE", projectStage: "source_instruction_evidence_stale" });
      inspected = inspectAggregate(await repository.getProject(projectId), await repository.listPatternFiles(projectId));
    }
    return inspected;
  }

  async function buildForProject(repository, projectId) {
    if (activeProjects.has(projectId)) return ensureForProject(repository, projectId);
    activeProjects.add(projectId);
    try {
      let inspected = await ensureForProject(repository, projectId);
      if (!inspected.evidence || !inspected.source) throw evidenceError("SOURCE_CHAIN_INCOMPLETE", "Source chain недоступна.");
      let working = inspected.evidence;
      const inheritedSelections = new Map(array(working.confirmedSnapshot?.selectedOptions).map((entry) => [entry.question?.kind, entry.selectedOptionId]));
      if (working.status === "confirmed" || working.status === "stale") working = rebuildFromSource(working, inspected.source.binding);
      const started = beginExtraction(working);
      await repository.updateCalculationProgress(projectId, inspected.calculation.calculation_id, PROGRESS_KIND, started, { baseProgressRevision: inspected.evidenceProgress.revision, operationKind: "SOURCE_PATTERN_INSTRUCTION_EVIDENCE_EXTRACTION_STARTED", projectStage: "source_instruction_evidence_extracting" });
      const result = buildEvidenceResult({ binding: inspected.source.binding, pages: inspected.source.pdf.pages, canonicalSizeOrder: inspected.source.canonicalSizeOrder, selectedSize: inspected.source.selectedSize });
      inspected = inspectAggregate(await repository.getProject(projectId), await repository.listPatternFiles(projectId));
      let completed = completeExtraction(inspected.evidence, result);
      for (const question of array(completed.result?.reviewQuestions)) {
        const inherited = inheritedSelections.get(question.kind);
        if (inherited && question.options.some((option) => option.id === inherited)) completed = setReviewDecision(completed, question.identity, inherited);
      }
      await repository.updateCalculationProgress(projectId, inspected.calculation.calculation_id, PROGRESS_KIND, completed, { baseProgressRevision: inspected.evidenceProgress.revision, operationKind: "SOURCE_PATTERN_INSTRUCTION_EVIDENCE_EXTRACTED", projectStage: `source_instruction_evidence_${completed.status}` });
      return inspectAggregate(await repository.getProject(projectId), await repository.listPatternFiles(projectId));
    } finally { activeProjects.delete(projectId); }
  }

  async function decideForProject(repository, projectId, questionId, optionId) { return mutateForProject(repository, projectId, (state) => setReviewDecision(state, questionId, optionId), "SOURCE_PATTERN_INSTRUCTION_EVIDENCE_REVIEWED"); }
  async function confirmForProject(repository, projectId) { return mutateForProject(repository, projectId, (state) => confirmEvidence(state), "SOURCE_PATTERN_INSTRUCTION_EVIDENCE_CONFIRMED"); }
  async function mutateForProject(repository, projectId, mutator, operationKind) {
    const inspected = await ensureForProject(repository, projectId);
    if (!inspected.evidence || !inspected.evidenceProgress || inspected.state === "stale") return inspected;
    const next = mutator(inspected.evidence);
    await repository.updateCalculationProgress(projectId, inspected.calculation.calculation_id, PROGRESS_KIND, next, { baseProgressRevision: inspected.evidenceProgress.revision, operationKind, projectStage: `source_instruction_evidence_${next.status}` });
    return inspectAggregate(await repository.getProject(projectId), await repository.listPatternFiles(projectId));
  }

  function validateConfirmedEvidence(state, expectedBinding = null) {
    const errors = [];
    try { requireState(state); } catch (error) { errors.push(error.code); return { valid: false, errors }; }
    if (state.status !== "confirmed" || !state.confirmedSnapshot) errors.push("EVIDENCE_NOT_CONFIRMED");
    if (state.confirmedSnapshot && fingerprint(copyWithout(state.confirmedSnapshot, "fingerprint")) !== state.confirmedSnapshot.fingerprint) errors.push("CONFIRMED_SNAPSHOT_FINGERPRINT_INVALID");
    if (expectedBinding && canonicalize(state.binding) !== canonicalize(expectedBinding)) errors.push("SOURCE_BINDING_CHANGED");
    return { valid: errors.length === 0, errors: [...new Set(errors)] };
  }

  function requireBinding(binding) {
    const required = ["projectId", "sourceDocumentIdentity", "sourceDocumentFingerprint", "sourceDocumentRevision", "analysisId", "stage19ReviewIdentity", "stage19AuthoritativeReviewRevision", "stage19SourceEvidenceFingerprint", "selectedSourceSize", "extractionAlgorithmVersion"];
    const missingFields = !object(binding) ? required : required.filter((field) => binding[field] === null || binding[field] === undefined || binding[field] === "");
    if (!object(binding) || missingFields.length || !array(binding.constructionSequence).length) throw evidenceError("SOURCE_BINDING_INVALID", "Source binding instruction evidence неполна.", { missingFields: [...missingFields, ...(!array(binding?.constructionSequence).length ? ["constructionSequence"] : [])] });
  }
  function requireState(state) {
    if (!object(state) || state.kind !== PROGRESS_KIND || state.schemaId !== SCHEMA_ID || state.contractVersion !== CONTRACT_VERSION || state.resultVersion !== RESULT_VERSION || state.algorithmVersion !== ALGORITHM_VERSION || !STATUSES.includes(state.status) || !positiveInteger(state.revision) || !text(state.id) || !object(state.binding) || state.bindingFingerprint !== fingerprint(state.binding) || !array(state.reviewDecisions) || !array(state.history) || !array(state.audit)) throw evidenceError("EVIDENCE_STATE_INVALID", "Запись source instruction evidence повреждена.");
    if (state.result && (state.result.identity !== state.resultIdentity || state.result.fingerprint !== state.resultFingerprint || resultFingerprint(state.result) !== state.resultFingerprint)) throw evidenceError("EVIDENCE_RESULT_FINGERPRINT_INVALID", "Result source instruction evidence был изменён.");
    if (state.confirmedSnapshot && fingerprint(copyWithout(state.confirmedSnapshot, "fingerprint")) !== state.confirmedSnapshot.fingerprint) throw evidenceError("CONFIRMED_SNAPSHOT_FINGERPRINT_INVALID", "Confirmed source instruction snapshot был изменён.");
  }
  function requireMutable(state) { requireState(state); if (["confirmed", "stale", "failed", "waiting", "extracting"].includes(state.status)) throw evidenceError("EVIDENCE_NOT_EDITABLE", "Evidence сейчас нельзя редактировать."); }
  function appendAudit(state, type, at, details = {}) { state.audit = [...array(state.audit), { type, at, revision: state.revision, ...copy(details) }].slice(-AUDIT_LIMIT); }
  function stableObjects(values) { const map = new Map(); for (const value of values) map.set(canonicalize(value), value); return [...map.values()].sort((a, b) => canonicalize(a).localeCompare(canonicalize(b))); }
  function copyWithout(value, key) { const result = copy(value); delete result[key]; return result; }
  function timestampNow() { return new Date().toISOString(); }
  function positiveInteger(value) { const number = Number(value); return Number.isInteger(number) && number > 0 ? number : null; }
  function integer(value) { const number = Number(value); return Number.isInteger(number) ? number : null; }
  function text(value) { return typeof value === "string" ? value.trim() : ""; }
  function object(value) { return value && typeof value === "object" && !Array.isArray(value) ? value : null; }
  function array(value) { return Array.isArray(value) ? value : []; }
  function copy(value) { return value === undefined ? undefined : JSON.parse(JSON.stringify(value)); }
  function deepFreeze(value) { if (value && typeof value === "object" && !Object.isFrozen(value)) { Object.freeze(value); for (const child of Object.values(value)) deepFreeze(child); } return value; }
  function evidenceError(code, message, details = {}) { return new SourceInstructionEvidenceError(code, message, details); }

  const api = {
    PROGRESS_KIND, SCHEMA_ID, CONTRACT_VERSION, RESULT_VERSION, ALGORITHM_VERSION, SIZE_SELECTION_ALGORITHM, STATUSES, CONSTRUCTION_SEQUENCE,
    SourceInstructionEvidenceError, canonicalize, fingerprint, parseCanonicalSizeOrder, representationTree, parseMultiSizeVector, conditionalSizeScope, vectorCandidates,
    sourceChunks, blockSpans, classifyInstruction, createEvidenceUnits, createReviewQuestions, coverageFor, blockerResolutionMap, buildProjection, readGradedSource,
    buildEvidenceResult, resultFingerprint, createInitialState, beginExtraction, completeExtraction, setReviewDecision, unresolvedIssues, canConfirm,
    readBackShoulderSection, readTwoPhaseRaglan, confirmEvidence, rebuildFromSource, markStale, currentBindingFromAggregate, inspectAggregate, ensureForProject, buildForProject, decideForProject,
    confirmForProject, validateConfirmedEvidence,
  };
  globalObject.YarnAIPatternSourceInstructionEvidence = Object.freeze(api);
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
