"use strict";

(function exposeIntentEngine(globalObject) {
  /** @typedef {Object} ProjectIntent */
  const STATE_VERSION = 2;
  const INTENT_SCHEMA_VERSION = 1;
  const MAX_FILE_BYTES = 15 * 1024 * 1024;

  const SOURCE_LABELS = {
    photo: "Фотография",
    pattern: "Схема или описание",
    text: "Рассказ словами",
  };

  const GARMENT_PATTERNS = [
    ["кардиган", /кардиган/i],
    ["свитер", /свитер|джемпер|пуловер/i],
    ["жилет", /жилет/i],
    ["платье", /плать/i],
    ["топ", /\bтоп\b/i],
    ["шапка", /шапк|берет/i],
    ["шарф", /шарф|снуд/i],
    ["носки", /нос(?:ки|ок)/i],
    ["варежки", /вареж|перчат/i],
    ["плед", /плед|покрывал/i],
    ["игрушка", /игруш|амигуруми/i],
  ];

  const WEARABLES = new Set([
    "кардиган",
    "свитер",
    "жилет",
    "платье",
    "топ",
    "шапка",
    "носки",
    "варежки",
  ]);
  const CONSTRUCTION_GARMENTS = new Set([
    "кардиган",
    "свитер",
    "жилет",
    "платье",
    "топ",
  ]);

  const FIELD_LABELS = {
    garmentType: "вид изделия",
    recipient: "для кого изделие",
    size: "размер",
    preserve: "что важно сохранить",
    desiredChanges: "что изменить в исходной схеме",
    desiredFeatures: "каким должен быть результат",
    yarnKnown: "выбрана ли пряжа",
    yarn: "пряжа",
    yarnAmount: "количество пряжи",
    construction: "конструкция изделия",
    sampleKnown: "контрольный образец",
    gauge: "плотность вязания",
    backDetails: "изменения спинки",
  };

  const QUESTION_DEFINITIONS = [
    {
      id: "item",
      field: "garmentType",
      stage: "discovery",
      priority: 10,
      text(intent) {
        return intent.sourceType === "text"
          ? "Расскажи, что ты хочешь связать?"
          : "Что именно ты хочешь связать по этому материалу?";
      },
    },
    {
      id: "recipient",
      field: "recipient",
      stage: "discovery",
      priority: 20,
      text: () => "Для кого будет эта вещь?",
    },
    {
      id: "size",
      field: "size",
      stage: "discovery",
      priority: 30,
      text: () => "Какой обычный размер носит этот человек?",
    },
    {
      id: "preserve",
      field: "preserve",
      stage: "discovery",
      priority: 40,
      text: () => "Что в этой вещи особенно важно сохранить?",
    },
    {
      id: "adaptation",
      field: "desiredChanges",
      stage: "discovery",
      priority: 40,
      text: () => "Что в этой схеме нужно оставить как есть, а что изменить?",
    },
    {
      id: "desiredFeatures",
      field: "desiredFeatures",
      stage: "discovery",
      priority: 40,
      text: () => "Каким должен получиться результат?",
    },
    {
      id: "yarnAvailability",
      field: "yarnKnown",
      stage: "discovery",
      priority: 50,
      text: () => "Пряжа для этой вещи уже есть?",
    },
    {
      id: "yarnDescription",
      field: "yarn",
      stage: "discovery",
      priority: 60,
      text: () => "Что известно об этой пряже?",
    },
    {
      id: "yarnAmount",
      field: "yarnAmount",
      stage: "discovery",
      priority: 70,
      text: () => "Сколько этой пряжи у тебя есть?",
    },
    {
      id: "yarnChoice",
      field: "yarn",
      stage: "technology",
      priority: 70,
      text: () => "Какую пряжу планируешь использовать?",
    },
    {
      id: "construction",
      field: "construction",
      stage: "technology",
      priority: 80,
      text: () => "Как должна быть устроена линия плеча или рукав?",
    },
    {
      id: "sampleKnown",
      field: "sampleKnown",
      stage: "technology",
      priority: 90,
      text: () => "Есть ли уже связанный контрольный образец?",
    },
    {
      id: "gauge",
      field: "gauge",
      stage: "technology",
      priority: 100,
      text: () => "Какая плотность вязания у образца?",
      canAsk(intent) {
        return intent.sampleKnown === true;
      },
    },
    {
      id: "backDetails",
      field: "backDetails",
      stage: "discovery",
      priority: 25,
      text: () => "Чем именно должна отличаться спинка?",
    },
  ];

  function cleanText(value, maximum = 240) {
    return String(value || "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, maximum);
  }

  function copy(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function questionCount(text) {
    return (String(text).match(/\?/g) || []).length;
  }

  function ensureOneQuestion(text) {
    if (questionCount(text) <= 1) {
      return text;
    }
    let seen = false;
    return String(text).replace(/\?/g, () => {
      if (!seen) {
        seen = true;
        return "?";
      }
      return ".";
    });
  }

  function newFacts() {
    return {
      _meta: {},
      _excluded: {
        construction: [],
      },
    };
  }

  function normalizeFacts(value) {
    const facts = value && typeof value === "object" ? copy(value) : {};
    facts._meta =
      facts._meta && typeof facts._meta === "object" ? facts._meta : {};
    facts._excluded =
      facts._excluded && typeof facts._excluded === "object"
        ? facts._excluded
        : {};
    facts._excluded.construction = Array.isArray(
      facts._excluded.construction,
    )
      ? facts._excluded.construction
      : [];
    return facts;
  }

  function setFact(facts, field, value, options = {}) {
    const normalized =
      typeof value === "string" ? cleanText(value, options.maximum || 500) : value;
    if (normalized === null || normalized === undefined || normalized === "") {
      return false;
    }
    const changed = JSON.stringify(facts[field]) !== JSON.stringify(normalized);
    facts[field] = normalized;
    facts._meta[field] = {
      confidence: Number(options.confidence ?? 0.95),
      assumed: Boolean(options.assumed),
      reason: cleanText(options.reason || "", 240),
    };
    return changed;
  }

  function clearFact(facts, field) {
    const existed = Object.hasOwn(facts, field);
    delete facts[field];
    delete facts._meta[field];
    return existed;
  }

  function detectGarment(text) {
    for (const [label, pattern] of GARMENT_PATTERNS) {
      if (pattern.test(text)) {
        return label;
      }
    }
    return null;
  }

  function detectSize(text) {
    const named = text.match(
      /(?:размер(?:а|ом)?|ношу|носит|будет|обычно)\s*(?:—|-|:)?\s*(XXXS|XXS|XS|S|M|L|XL|XXL|XXXL|\d{2,3})\b/i,
    );
    if (named) {
      return named[1].toUpperCase();
    }
    const standalone = text.match(/\b(XXXS|XXS|XS|S|M|L|XL|XXL|XXXL)\b/i);
    return standalone ? standalone[1].toUpperCase() : null;
  }

  function detectYarnAmount(text) {
    const amount = text.match(
      /(\d{2,5})\s*(?:грамм(?:а|ов)?|метр(?:а|ов)?|гр|г|м)(?=\s|[.,!?]|$)/i,
    );
    return amount ? cleanText(amount[0], 80) : null;
  }

  function parseNumber(value) {
    return Number(String(value).replace(",", "."));
  }

  function detectGauge(text) {
    const combined = text.match(
      /(\d+(?:[.,]\d+)?)\s*(?:петель|петли|п\.)\s*(?:и|,)?\s*(\d+(?:[.,]\d+)?)?\s*(?:рядов|ряда|р\.)?\s*(?:на|в)\s*(\d+(?:[.,]\d+)?)\s*см/i,
    );
    if (combined) {
      return {
        stitches: parseNumber(combined[1]),
        rows: combined[2] ? parseNumber(combined[2]) : null,
        widthCm: parseNumber(combined[3]),
        heightCm: combined[2] ? parseNumber(combined[3]) : null,
        raw: cleanText(combined[0], 160),
      };
    }
    const stitches = text.match(
      /(\d+(?:[.,]\d+)?)\s*(?:петель|петли|п\.)[^.!?]{0,40}?(?:на|в)\s*(\d+(?:[.,]\d+)?)\s*см/i,
    );
    const rows = text.match(
      /(\d+(?:[.,]\d+)?)\s*(?:рядов|ряда|р\.)[^.!?]{0,40}?(?:на|в)\s*(\d+(?:[.,]\d+)?)\s*см/i,
    );
    if (!stitches && !rows) {
      return null;
    }
    return {
      stitches: stitches ? parseNumber(stitches[1]) : null,
      rows: rows ? parseNumber(rows[1]) : null,
      widthCm: stitches ? parseNumber(stitches[2]) : null,
      heightCm: rows ? parseNumber(rows[2]) : null,
      raw: cleanText(text, 160),
    };
  }

  function isAffirmative(text) {
    return /^(?:да|верно|всё верно|правильно|точно|ага|угу)[.!]*$/i.test(
      cleanText(text),
    );
  }

  function isNegative(text) {
    return /^(?:нет|неверно|не совсем|не так)[.!]*$/i.test(cleanText(text));
  }

  function sourceTypeFor(state) {
    const pdf = [...(state.attachments || [])]
      .reverse()
      .find(
        (attachment) =>
          attachment.type === "application/pdf" ||
          attachment.name.toLowerCase().endsWith(".pdf"),
      );
    if (pdf) {
      return "pdf";
    }
    return state.sourceType;
  }

  function learnGeneralFacts(facts, text) {
    const changed = [];
    const mark = (field, value, options) => {
      if (setFact(facts, field, value, options)) {
        changed.push(field);
      }
    };

    const garment = detectGarment(text);
    if (garment) {
      mark("item", garment, { confidence: 0.98 });
    }

    const child =
      /детск|реб[её]нок|реб[её]нка|для\s+(?:сына|дочери|мальчика|девочки)|малыш/i.test(
        text,
      );
    const male =
      /мужск|для\s+(?:мужчины|мужа|папы|сына|мальчика)|мальчик/i.test(text);
    const female =
      /женск|для\s+(?:женщины|жены|мамы|дочери|девочки)|девочк/i.test(text);

    if (child) {
      mark("ageGroup", "child", { confidence: 0.98 });
      if (/сына|мальчик/i.test(text)) {
        mark("recipient", "для мальчика", { confidence: 0.95 });
      } else if (/дочери|девочк/i.test(text)) {
        mark("recipient", "для девочки", { confidence: 0.95 });
      } else {
        mark("recipient", "для ребёнка", { confidence: 0.9 });
        if (!male && !female) {
          if (clearFact(facts, "gender")) {
            changed.push("gender");
          }
        }
      }
    } else if (/взросл/i.test(text)) {
      mark("ageGroup", "adult", { confidence: 0.95 });
    }

    if (male) {
      mark("gender", "male", {
        confidence: /мужск/i.test(text) ? 0.98 : 0.82,
        assumed: !/мужск/i.test(text),
        reason: /мужск/i.test(text) ? "" : "определено по получателю",
      });
      if (!facts.recipient) {
        mark("recipient", "для мужчины", { confidence: 0.9 });
      }
    } else if (female) {
      mark("gender", "female", {
        confidence: /женск/i.test(text) ? 0.98 : 0.82,
        assumed: !/женск/i.test(text),
        reason: /женск/i.test(text) ? "" : "определено по получателю",
      });
      if (!facts.recipient) {
        mark("recipient", "для женщины", { confidence: 0.9 });
      }
    }

    if (/для\s+себя|мне\b/i.test(text)) {
      mark("recipient", "для себя", { confidence: 0.96 });
    } else {
      const recipient = text.match(
        /для\s+(реб[её]нка|дочери|сына|мамы|папы|мужа|жены|подруги|мужчины|женщины|мальчика|девочки)/i,
      );
      if (recipient) {
        mark("recipient", cleanText(recipient[0], 100), { confidence: 0.96 });
      }
    }

    const size = detectSize(text);
    if (size) {
      mark("size", size, { confidence: 0.99 });
    }

    const styles = [
      ["оверсайз", /оверсайз/i],
      ["свободный", /свободн/i],
      ["приталенный", /приталенн/i],
      ["классический", /классическ/i],
      ["минималистичный", /минималистич/i],
      ["ажурный", /ажурн/i],
    ];
    for (const [label, pattern] of styles) {
      if (pattern.test(text)) {
        mark("style", label, { confidence: 0.94 });
        break;
      }
    }

    if (/крючк/i.test(text)) {
      mark("technique", "крючок", { confidence: 0.99 });
    } else if (/спиц/i.test(text)) {
      mark("technique", "спицы", { confidence: 0.99 });
    }

    const rejectsRaglan =
      /не\s+(?:будет\s+)?реглан|это\s+не\s+реглан|не\s+реглан/i.test(text);
    if (rejectsRaglan) {
      const excluded = new Set(facts._excluded.construction);
      excluded.add("реглан");
      facts._excluded.construction = [...excluded];
      if (/реглан/i.test(String(facts.construction || ""))) {
        if (clearFact(facts, "construction")) {
          changed.push("construction");
        }
      }
      setFact(facts, "construction", "не реглан", { confidence: 0.99 });
    }
    if (/реглан/i.test(text) && !rejectsRaglan) {
      mark("construction", /сверху/i.test(text) ? "реглан сверху" : "реглан", {
        confidence: 0.98,
      });
      facts._excluded.construction = facts._excluded.construction.filter(
        (value) => value !== "реглан",
      );
    }
    if (/втачн/i.test(text)) {
      mark("construction", "втачной рукав", { confidence: 0.98 });
    } else if (/спущенн\w*\s+плеч/i.test(text)) {
      mark("construction", "спущенное плечо", { confidence: 0.98 });
    } else if (/кругл\w*\s+кокет/i.test(text)) {
      mark("construction", "круглая кокетка", { confidence: 0.98 });
    }

    const yarnRejected =
      /(?:пряж[аи]?\s+(?:пока\s+)?нет|нет\s+пряжи|пряжу\s+не\s+(?:выбрал|купил|наш[её]л))/i.test(
        text,
      );
    const yarnMentioned = /пряж|шерст|хлоп|акрил|мохер|меринос|альпак/i.test(text);
    if (yarnRejected) {
      mark("yarnStatus", "no", { confidence: 0.99 });
      if (clearFact(facts, "yarnDescription")) {
        changed.push("yarnDescription");
      }
      if (clearFact(facts, "yarnAmount")) {
        changed.push("yarnAmount");
      }
    } else if (
      yarnMentioned &&
      (/есть|имеется|купил|взял|наш[её]л|использую|будет|из\s+/i.test(text) ||
        detectYarnAmount(text))
    ) {
      mark("yarnStatus", "yes", { confidence: 0.97 });
      const description = text.match(
        /(?:пряж[аи]|из)\s+(?:есть\s+)?([^.!?]{3,120})/i,
      );
      if (description && !/^(?:нет|пока нет)$/i.test(description[1].trim())) {
        mark("yarnDescription", cleanText(description[1], 140), {
          confidence: 0.9,
        });
      } else {
        const fibre = text.match(
          /(?:шерстян\w*|полушерст\w*|хлопков\w*|акрилов\w*|мохер\w*|меринос\w*|альпак\w*)/i,
        );
        if (fibre) {
          mark("yarnDescription", cleanText(fibre[0], 80), {
            confidence: 0.9,
          });
        }
      }
    }
    const amount = detectYarnAmount(text);
    if (amount && yarnMentioned) {
      mark("yarnStatus", "yes", { confidence: 0.98 });
      mark("yarnAmount", amount, { confidence: 0.98 });
    }

    const sampleRejected =
      /нет\s+(?:связанного\s+)?(?:контрольного\s+)?образца|образец\s+(?:ещ[её]\s+)?не\s+связан/i.test(
        text,
      );
    if (sampleRejected) {
      mark("sampleStatus", "no", { confidence: 0.99 });
      mark("gaugeStatus", "no", { confidence: 0.95 });
      if (clearFact(facts, "gauge")) {
        changed.push("gauge");
      }
    } else if (
      /образец\s+(?:уже\s+)?(?:есть|связан|готов)|связал\w*\s+образец/i.test(text)
    ) {
      mark("sampleStatus", "yes", { confidence: 0.99 });
    }

    const gauge = detectGauge(text);
    if (gauge) {
      mark("gauge", gauge, { confidence: 0.99 });
      mark("gaugeStatus", "yes", { confidence: 0.99 });
      mark("sampleStatus", "yes", {
        confidence: 0.9,
        assumed: true,
        reason: "плотность обычно измеряют по контрольному образцу",
      });
    } else if (
      /плотност\w*\s+(?:не\s+знаю|нет|не\s+известна)|не\s+знаю\s+плотност/i.test(
        text,
      )
    ) {
      mark("gaugeStatus", "no", { confidence: 0.98 });
    }

    if (/спин\w*.*(?:друг|отлич)/i.test(text)) {
      mark("back", "будет другой", { confidence: 0.95 });
    }

    return {
      changed,
      rejectsRaglan,
      differentBack: /спин\w*.*(?:друг|отлич)/i.test(text),
    };
  }

  function learnExpectedFact(facts, questionId, text, interpretation) {
    const answer = cleanText(text, 500);
    if (!answer) {
      return;
    }
    if (["item", "garmentType"].includes(questionId) && !facts.item) {
      setFact(facts, "item", answer, { confidence: 0.78 });
    } else if (questionId === "recipient") {
      setFact(facts, "recipient", answer, { confidence: 0.92 });
    } else if (questionId === "size") {
      setFact(facts, "size", detectSize(answer) || answer, {
        confidence: 0.96,
      });
    } else if (questionId === "preserve") {
      setFact(facts, "preserve", answer, { confidence: 0.92 });
    } else if (["adaptation", "desiredChanges"].includes(questionId)) {
      setFact(facts, "desiredChanges", answer, { confidence: 0.92 });
    } else if (questionId === "desiredFeatures") {
      setFact(facts, "desiredFeatures", answer, { confidence: 0.92 });
    } else if (
      ["yarnAvailability", "yarnKnown"].includes(questionId) &&
      !facts.yarnStatus
    ) {
      if (/^(?:нет|пока нет|не выбрал|не купил)/i.test(answer)) {
        setFact(facts, "yarnStatus", "no", { confidence: 0.98 });
      } else {
        setFact(facts, "yarnStatus", "yes", { confidence: 0.95 });
        if (!/^(?:да|есть|ага|угу)[.!]*$/i.test(answer)) {
          setFact(facts, "yarnDescription", answer, { confidence: 0.88 });
        }
      }
    } else if (
      ["yarnDescription", "yarn", "yarnChoice"].includes(questionId) &&
      !facts.yarnDescription
    ) {
      setFact(facts, "yarnDescription", answer, { confidence: 0.92 });
      setFact(facts, "yarnStatus", "yes", { confidence: 0.96 });
    } else if (questionId === "yarnAmount" && !facts.yarnAmount) {
      setFact(facts, "yarnAmount", detectYarnAmount(answer) || answer, {
        confidence: 0.94,
      });
    } else if (
      questionId === "construction" &&
      !facts.construction &&
      !interpretation.rejectsRaglan
    ) {
      setFact(facts, "construction", answer, { confidence: 0.86 });
    } else if (questionId === "sampleKnown" && !facts.sampleStatus) {
      if (/^(?:нет|пока нет|ещ[её] нет)/i.test(answer)) {
        setFact(facts, "sampleStatus", "no", { confidence: 0.98 });
        setFact(facts, "gaugeStatus", "no", { confidence: 0.95 });
      } else {
        setFact(facts, "sampleStatus", "yes", { confidence: 0.96 });
      }
    } else if (questionId === "gauge" && !facts.gauge) {
      const gauge = detectGauge(answer);
      if (gauge) {
        setFact(facts, "gauge", gauge, { confidence: 0.99 });
        setFact(facts, "gaugeStatus", "yes", { confidence: 0.99 });
      } else {
        setFact(facts, "gaugeStatus", "no", { confidence: 0.75 });
      }
    } else if (questionId === "backDetails") {
      setFact(facts, "backDetails", answer, { confidence: 0.94 });
    } else if (questionId === "correction") {
      setFact(facts, "correction", answer, { confidence: 0.8 });
    }
  }

  function fieldValue(intent, field) {
    if (field === "preserve") {
      return intent.preferences.preserve;
    }
    if (field === "desiredChanges") {
      return intent.preferences.desiredChanges;
    }
    if (field === "desiredFeatures") {
      return intent.preferences.desiredFeatures;
    }
    if (field === "backDetails") {
      return intent.preferences.backDetails;
    }
    return intent[field];
  }

  function missingEntry(field, stage, reason, requiredFor) {
    return {
      field,
      label: FIELD_LABELS[field],
      status: "unknown",
      required: true,
      stage,
      requiredFor,
      reason,
    };
  }

  function collectMissingInformation(intent) {
    const missing = [];
    const add = (field, stage, reason, requiredFor) => {
      if (!fieldValue(intent, field)) {
        missing.push(missingEntry(field, stage, reason, requiredFor));
      }
    };

    add(
      "garmentType",
      "discovery",
      "без вида изделия нельзя определить применимые правила",
      "project-understanding",
    );
    if (intent.garmentType && WEARABLES.has(intent.garmentType)) {
      add(
        "recipient",
        "discovery",
        "посадка зависит от получателя",
        "project-understanding",
      );
      add(
        "size",
        "discovery",
        "размер нужен для будущих расчётов",
        "project-understanding",
      );
    }
    if (intent.sourceType === "photo") {
      add(
        "preserve",
        "discovery",
        "нужно понять важные особенности референса",
        "project-understanding",
      );
    } else if (["pattern", "pdf"].includes(intent.sourceType)) {
      add(
        "desiredChanges",
        "discovery",
        "нужно определить границы адаптации",
        "project-understanding",
      );
    } else if (intent.sourceType === "text") {
      add(
        "desiredFeatures",
        "discovery",
        "нужно зафиксировать ожидаемый результат",
        "project-understanding",
      );
    }
    if (intent.yarnKnown === null) {
      missing.push(
        missingEntry(
          "yarnKnown",
          "discovery",
          "состояние пряжи влияет на следующие вопросы",
          "project-understanding",
        ),
      );
    } else if (intent.yarnKnown === true) {
      add(
        "yarn",
        "discovery",
        "характеристики пряжи влияют на технологию",
        "project-understanding",
      );
      add(
        "yarnAmount",
        "discovery",
        "количество нужно для проверки реализуемости",
        "feasibility",
      );
    } else {
      missing.push(
        missingEntry(
          "yarn",
          "technology",
          "пряжу нужно выбрать до расчёта плотности",
          "technology",
        ),
      );
    }

    if (
      intent.garmentType &&
      CONSTRUCTION_GARMENTS.has(intent.garmentType) &&
      !intent.construction
    ) {
      missing.push(
        missingEntry(
          "construction",
          "technology",
          "конструкция определяет порядок и формулы вязания",
          "technology",
        ),
      );
    }
    if (intent.sampleKnown === null) {
      missing.push(
        missingEntry(
          "sampleKnown",
          "technology",
          "нужно понять, можно ли измерить фактическую плотность",
          "calculation",
        ),
      );
    } else if (intent.sampleKnown === false) {
      missing.push(
        missingEntry(
          "sampleKnown",
          "action",
          "до расчётов нужно связать и обработать контрольный образец",
          "calculation",
        ),
      );
    }
    if (!intent.gaugeKnown) {
      missing.push(
        missingEntry(
          "gauge",
          "technology",
          "без плотности нельзя перевести размеры в петли и ряды",
          "calculation",
        ),
      );
    }
    if (
      intent.preferences.back === "будет другой" &&
      !intent.preferences.backDetails
    ) {
      missing.push(
        missingEntry(
          "backDetails",
          "discovery",
          "изменение спинки нужно описать",
          "project-understanding",
        ),
      );
    }
    return missing;
  }

  function statusFor(intent, field, value, factsField = field) {
    if (value === null || value === undefined || value === "") {
      intent.fieldStatus[field] = "unknown";
      intent.confidence[field] = 0;
      return;
    }
    const metadata = intent._metadata[factsField];
    intent.fieldStatus[field] = metadata?.assumed ? "assumed" : "known";
    intent.confidence[field] = Number(metadata?.confidence ?? 0.9);
    if (metadata?.assumed) {
      intent.assumptions.push({
        field,
        value: copy(value),
        confidence: intent.confidence[field],
        reason: metadata.reason || "значение выведено по правилам",
      });
    }
  }

  function gaugeLabel(gauge) {
    if (!gauge) {
      return "";
    }
    const parts = [];
    if (gauge.stitches && gauge.widthCm) {
      parts.push(`${gauge.stitches} п. на ${gauge.widthCm} см`);
    }
    if (gauge.rows && gauge.heightCm) {
      parts.push(`${gauge.rows} р. на ${gauge.heightCm} см`);
    }
    return parts.join(", ") || gauge.raw || "";
  }

  function garmentDescription(intent) {
    if (!intent.garmentType) {
      return "";
    }
    let adjective = "";
    if (intent.ageGroup === "child") {
      adjective = "детский";
    } else if (intent.gender === "male") {
      adjective = "мужской";
    } else if (intent.gender === "female") {
      adjective = "женский";
    }
    return [adjective, intent.garmentType].filter(Boolean).join(" ");
  }

  function knownFactRows(intent) {
    return [
      ["Изделие", garmentDescription(intent), intent.fieldStatus.garmentType],
      ["Для кого", intent.recipient, intent.fieldStatus.recipient],
      ["Размер", intent.size, intent.fieldStatus.size],
      ["Стиль", intent.style, intent.fieldStatus.style],
      ["Конструкция", intent.construction, intent.fieldStatus.construction],
      ["Техника", intent.technique, intent.fieldStatus.technique],
      [
        "Пряжа",
        intent.yarnKnown === false ? "пока не выбрана" : intent.yarn,
        intent.yarnKnown === false ? "known" : intent.fieldStatus.yarn,
      ],
      ["Количество пряжи", intent.yarnAmount, intent.fieldStatus.yarnAmount],
      ["Плотность", gaugeLabel(intent.gauge), intent.fieldStatus.gauge],
      [
        "Важно сохранить",
        intent.preferences.preserve,
        intent.fieldStatus.preserve,
      ],
      [
        "Желаемые изменения",
        intent.preferences.desiredChanges,
        intent.fieldStatus.desiredChanges,
      ],
      [
        "Результат",
        intent.preferences.desiredFeatures,
        intent.fieldStatus.desiredFeatures,
      ],
      [
        "Спинка",
        intent.preferences.backDetails || intent.preferences.back,
        intent.fieldStatus.backDetails,
      ],
    ]
      .filter((entry) => entry[1])
      .map(([label, value, status]) => ({ label, value, status }));
  }

  class IntentProvider {
    startTurn(_state) {
      throw new Error("IntentProvider.startTurn must be implemented.");
    }

    nextTurn(_state, _text) {
      throw new Error("IntentProvider.nextTurn must be implemented.");
    }

    buildIntent(_state) {
      throw new Error("IntentProvider.buildIntent must be implemented.");
    }

    selectNextQuestion(_intent, _stage) {
      throw new Error("IntentProvider.selectNextQuestion must be implemented.");
    }

    selectNextRequiredQuestion(_intent) {
      throw new Error(
        "IntentProvider.selectNextRequiredQuestion must be implemented.",
      );
    }
  }

  class RuleBasedProvider extends IntentProvider {
    buildIntent(state) {
      const facts = normalizeFacts(state.facts);
      const intent = {
        schemaVersion: INTENT_SCHEMA_VERSION,
        goal: null,
        garmentType: facts.item || null,
        recipient: facts.recipient || null,
        gender: facts.gender || null,
        ageGroup: facts.ageGroup || null,
        size: facts.size || null,
        style: facts.style || null,
        construction:
          facts.construction && !/^не\s+/i.test(facts.construction)
            ? facts.construction
            : null,
        technique: facts.technique || null,
        yarnKnown:
          facts.yarnStatus === "yes"
            ? true
            : facts.yarnStatus === "no"
              ? false
              : null,
        yarn: facts.yarnDescription || null,
        yarnAmount: facts.yarnAmount || null,
        sampleKnown:
          facts.sampleStatus === "yes"
            ? true
            : facts.sampleStatus === "no"
              ? false
              : null,
        gaugeKnown:
          facts.gaugeStatus === "yes"
            ? true
            : facts.gaugeStatus === "no"
              ? false
              : null,
        gauge: facts.gauge || null,
        sourceType: sourceTypeFor(state),
        sourceReferences: copy(state.attachments || []),
        preferences: {
          preserve: facts.preserve || null,
          desiredChanges: facts.desiredChanges || null,
          desiredFeatures: facts.desiredFeatures || null,
          back: facts.back || null,
          backDetails: facts.backDetails || null,
        },
        excludedValues: {
          construction: copy(facts._excluded.construction),
        },
        confidence: {},
        fieldStatus: {},
        assumptions: [],
        knownInformation: [],
        unknownInformation: [],
        requiredInformation: [],
        missingInformation: [],
        _metadata: copy(facts._meta),
      };

      if (intent.garmentType) {
        intent.goal = `связать ${intent.garmentType}`;
        intent._metadata.goal = {
          confidence: 0.88,
          assumed: true,
          reason: "цель сформирована из выбранного изделия",
        };
      }
      if (intent.garmentType && !intent.technique) {
        intent.technique = "спицы";
        intent._metadata.technique = {
          confidence: 0.55,
          assumed: true,
          reason: "базовое предположение для вязального проекта",
        };
      }

      const fields = [
        ["goal", intent.goal],
        ["garmentType", intent.garmentType, "item"],
        ["recipient", intent.recipient],
        ["gender", intent.gender],
        ["ageGroup", intent.ageGroup],
        ["size", intent.size],
        ["style", intent.style],
        ["construction", intent.construction],
        ["technique", intent.technique],
        ["yarnKnown", intent.yarnKnown, "yarnStatus"],
        ["yarn", intent.yarn, "yarnDescription"],
        ["yarnAmount", intent.yarnAmount],
        ["sampleKnown", intent.sampleKnown, "sampleStatus"],
        ["gaugeKnown", intent.gaugeKnown, "gaugeStatus"],
        ["gauge", intent.gauge],
        ["preserve", intent.preferences.preserve],
        ["desiredChanges", intent.preferences.desiredChanges],
        ["desiredFeatures", intent.preferences.desiredFeatures],
        ["backDetails", intent.preferences.backDetails],
      ];
      for (const [field, value, factsField] of fields) {
        statusFor(intent, field, value, factsField);
      }
      intent.fieldStatus.sourceType = intent.sourceType ? "known" : "unknown";
      intent.confidence.sourceType = intent.sourceType ? 1 : 0;

      intent.missingInformation = collectMissingInformation(intent);
      intent.requiredInformation = intent.missingInformation.filter(
        (item) => item.required,
      );
      intent.unknownInformation = intent.missingInformation.map(
        ({ field, label, stage }) => ({ field, label, stage }),
      );
      intent.knownInformation = fields
        .filter(([field, value]) => value !== null && value !== undefined && value !== "")
        .map(([field, value]) => ({
          field,
          value: copy(value),
          status: intent.fieldStatus[field],
          confidence: intent.confidence[field],
        }));
      delete intent._metadata;
      return intent;
    }

    selectNextQuestion(intent, stage) {
      const missingFields = new Set(
        intent.missingInformation
          .filter((item) => item.stage === stage)
          .map((item) => item.field),
      );
      const definition = QUESTION_DEFINITIONS.filter(
        (item) => item.stage === stage && missingFields.has(item.field),
      )
        .filter((item) => !item.canAsk || item.canAsk(intent))
        .sort((left, right) => left.priority - right.priority)[0];
      if (!definition) {
        return null;
      }
      return {
        id: definition.id,
        field: definition.field,
        stage: definition.stage,
        text: ensureOneQuestion(definition.text(intent)),
      };
    }

    selectNextRequiredQuestion(intent) {
      return (
        this.selectNextQuestion(intent, "discovery") ||
        this.selectNextQuestion(intent, "technology")
      );
    }

    buildSummary(intent) {
      const knownItems = [];
      const garment = garmentDescription(intent);
      if (garment) {
        knownItems.push(garment);
      }
      if (intent.size) {
        knownItems.push(`размер ${intent.size}`);
      }
      if (intent.style) {
        knownItems.push(`стиль — ${intent.style}`);
      }
      if (intent.construction) {
        knownItems.push(intent.construction);
      }
      if (intent.technique) {
        knownItems.push(`техника — ${intent.technique}`);
      }
      if (intent.yarnKnown === false) {
        knownItems.push("пряжа пока не выбрана");
      } else if (intent.yarn) {
        knownItems.push(`пряжа — ${intent.yarn}`);
      }
      if (intent.yarnAmount) {
        knownItems.push(`количество — ${intent.yarnAmount}`);
      }
      if (intent.gauge) {
        knownItems.push(`плотность — ${gaugeLabel(intent.gauge)}`);
      }

      const assumptions = intent.assumptions.map((assumption) => {
        if (assumption.field === "technique") {
          return `предполагаю технику «${assumption.value}»`;
        }
        if (assumption.field === "goal") {
          return `цель сформулирована как «${assumption.value}»`;
        }
        return `${assumption.field}: ${assumption.value}`;
      });
      const missing = intent.missingInformation.map((item) => ({
        field: item.field,
        label: item.label,
        reason: item.reason,
        stage: item.stage,
      }));
      const nextQuestion = this.selectNextRequiredQuestion(intent);
      return {
        title: "Понял.",
        introduction: "Ты хочешь связать:",
        knownItems,
        assumptions,
        missingItems: missing,
        warning:
          missing.length > 0
            ? "Без обязательных данных пока невозможно построить технологию вязания."
            : "Обязательных данных достаточно, чтобы перейти к построению технологии.",
        nextQuestion,
        canContinue: Boolean(nextQuestion),
        complete: missing.length === 0,
        knownFacts: knownFactRows(intent),
      };
    }

    startTurn(state) {
      const intent = this.buildIntent(state);
      let introduction;
      if (state.sourceType === "photo") {
        introduction =
          "Я получил фотографию. Это rule-based прототип: детали изображения не распознаются автоматически, поэтому уточним проект по твоим ответам.";
      } else if (state.sourceType === "pattern") {
        introduction =
          "Я получил схему или описание. Содержимое файла не разбирается автоматически, поэтому уточним только нужные параметры.";
      } else {
        introduction =
          "Можно описать идею обычными словами — профессиональные термины не нужны.";
      }
      const question = this.selectNextQuestion(intent, "discovery");
      return {
        facts: copy(state.facts),
        projectIntent: intent,
        summary: this.buildSummary(intent),
        phase: "active",
        dialogMode: "discovery",
        question,
        text: `${introduction}\n\n${question.text}`,
      };
    }

    attachmentTurn(state, attachment) {
      const intent = this.buildIntent(state);
      const kind =
        attachment.kind === "photo" ? "фотографию" : "схему или описание";
      const question =
        state.currentQuestion || this.selectNextQuestion(intent, "discovery");
      return {
        facts: copy(state.facts),
        projectIntent: intent,
        summary: this.buildSummary(intent),
        phase: state.phase === "completed" ? "active" : state.phase,
        dialogMode: state.dialogMode || "discovery",
        question,
        text: `Я добавил ${kind}. Файл сохранён в проекте без автоматического разбора.\n\n${question.text}`,
      };
    }

    nextTurn(state, text) {
      const facts = normalizeFacts(state.facts);
      const interpretation = learnGeneralFacts(facts, text);
      if (!interpretation.rejectsRaglan && !interpretation.differentBack) {
        learnExpectedFact(
          facts,
          state.currentQuestion?.id,
          text,
          interpretation,
        );
      }
      const nextState = { ...state, facts };
      const intent = this.buildIntent(nextState);
      const summary = this.buildSummary(intent);

      if (
        state.currentQuestion?.id === "confirm" &&
        isAffirmative(text)
      ) {
        return {
          facts,
          projectIntent: intent,
          summary,
          phase: "summary",
          dialogMode: "summary",
          question: null,
          text: "Понял. Я собрал внутреннее описание проекта.",
        };
      }

      if (
        state.currentQuestion?.id === "confirm" &&
        isNegative(text)
      ) {
        const question = {
          id: "correction",
          field: "correction",
          stage: "discovery",
          text: "Что именно я понял неверно?",
        };
        return {
          facts,
          projectIntent: intent,
          summary,
          phase: "active",
          dialogMode: "discovery",
          question,
          text: `Хорошо, исправим описание.\n\n${question.text}`,
        };
      }

      if (
        state.dialogMode === "requirements" ||
        state.dialogMode === "summary-correction"
      ) {
        return {
          facts,
          projectIntent: intent,
          summary,
          phase: "summary",
          dialogMode: "summary",
          question: null,
          text: "Описание проекта пересчитано.",
        };
      }

      let question = null;
      let acknowledgement = "";
      if (interpretation.rejectsRaglan && !intent.construction) {
        question = {
          id: "construction",
          field: "construction",
          stage: "technology",
          text: "Как должна быть устроена линия плеча или рукав?",
        };
        acknowledgement = "Понял: конструкция не реглан.";
      } else if (
        interpretation.differentBack &&
        !intent.preferences.backDetails
      ) {
        question = {
          id: "backDetails",
          field: "backDetails",
          stage: "discovery",
          text: "Чем именно должна отличаться спинка?",
        };
        acknowledgement =
          "Понял: спинка должна отличаться от исходного варианта.";
      } else {
        question = this.selectNextQuestion(intent, "discovery");
      }

      if (!question) {
        question = {
          id: "confirm",
          field: "confirmation",
          stage: "discovery",
          text: "Я всё верно понял?",
        };
      }
      if (!acknowledgement) {
        const garment = garmentDescription(intent);
        acknowledgement = garment
          ? `Пока я понял так: ${garment}${intent.size ? `, размер ${intent.size}` : ""}.`
          : "Спасибо, продолжаем.";
      }
      return {
        facts,
        projectIntent: intent,
        summary,
        phase: "active",
        dialogMode: "discovery",
        question,
        text: `${acknowledgement}\n\n${question.text}`,
      };
    }

    continueTurn(state) {
      const intent = this.buildIntent(state);
      const summary = this.buildSummary(intent);
      const question = this.selectNextRequiredQuestion(intent);
      if (!question) {
        return {
          facts: copy(state.facts),
          projectIntent: intent,
          summary,
          phase: "completed",
          dialogMode: "summary",
          question: null,
          text: "Все обязательные данные, которые можно уточнить сейчас, собраны.",
        };
      }
      return {
        facts: copy(state.facts),
        projectIntent: intent,
        summary,
        phase: "active",
        dialogMode: "requirements",
        question,
        text: `Следующий действительно необходимый параметр.\n\n${question.text}`,
      };
    }

    correctionTurn(state, text) {
      const correctionState = {
        ...state,
        dialogMode: "summary-correction",
        currentQuestion: {
          id: "correction",
          field: "correction",
          stage: "discovery",
          text: "Что нужно исправить?",
        },
      };
      return this.nextTurn(correctionState, text);
    }
  }

  function newState() {
    return {
      version: STATE_VERSION,
      sourceType: null,
      sources: [],
      attachments: [],
      facts: newFacts(),
      projectIntent: null,
      summary: null,
      messages: [],
      currentQuestion: null,
      phase: "idle",
      dialogMode: "discovery",
    };
  }

  function assistantMessage(text) {
    return {
      role: "assistant",
      kind: "text",
      text: ensureOneQuestion(text),
      createdAt: new Date().toISOString(),
    };
  }

  function userMessage(text, kind = "text", attachment = null) {
    return {
      role: "user",
      kind,
      text: cleanText(text, 2000),
      attachment: attachment ? copy(attachment) : null,
      createdAt: new Date().toISOString(),
    };
  }

  class ProjectUnderstandingEngine {
    constructor(provider = new RuleBasedProvider(), state = null) {
      if (
        !provider ||
        typeof provider.startTurn !== "function" ||
        typeof provider.nextTurn !== "function"
      ) {
        throw new TypeError(
          "Intent provider must implement startTurn and nextTurn.",
        );
      }
      this.provider = provider;
      this.state = state ? this._validatedState(state) : newState();
      this._refreshUnderstanding();
    }

    _validatedState(value) {
      if (
        !value ||
        ![1, STATE_VERSION].includes(value.version) ||
        !Array.isArray(value.messages) ||
        !value.facts ||
        typeof value.facts !== "object"
      ) {
        throw new TypeError("Saved dialogue state is invalid.");
      }
      const state = {
        ...newState(),
        ...copy(value),
        version: STATE_VERSION,
        facts: normalizeFacts(value.facts),
      };
      state.sources = Array.isArray(state.sources) ? state.sources : [];
      state.attachments = Array.isArray(state.attachments)
        ? state.attachments
        : [];
      return state;
    }

    _refreshUnderstanding() {
      if (typeof this.provider.buildIntent !== "function") {
        return;
      }
      this.state.projectIntent = this.provider.buildIntent(copy(this.state));
      if (typeof this.provider.buildSummary === "function") {
        this.state.summary = this.provider.buildSummary(
          copy(this.state.projectIntent),
        );
      }
    }

    _applyTurn(turn) {
      if (!turn || typeof turn.text !== "string") {
        throw new TypeError("Intent provider returned an invalid turn.");
      }
      if (questionCount(turn.text) > 1) {
        throw new Error("Assistant turn must contain no more than one question.");
      }
      this.state.facts = normalizeFacts(turn.facts || this.state.facts);
      this.state.phase = turn.phase || "active";
      this.state.dialogMode = turn.dialogMode || this.state.dialogMode;
      this.state.currentQuestion = turn.question ? copy(turn.question) : null;
      if (turn.projectIntent) {
        this.state.projectIntent = copy(turn.projectIntent);
      }
      if (turn.summary) {
        this.state.summary = copy(turn.summary);
      }
      this.state.messages.push(assistantMessage(turn.text));
      this._refreshUnderstanding();
      return copy(this.state);
    }

    start(sourceType, attachment = null) {
      if (!SOURCE_LABELS[sourceType]) {
        throw new TypeError("Unknown dialogue source.");
      }
      this.state = newState();
      this.state.sourceType = sourceType;
      this.state.sources = [sourceType];
      this.state.phase = "active";
      if (attachment) {
        const metadata = this._attachmentMetadata(sourceType, attachment);
        this.state.attachments.push(metadata);
        this.state.messages.push(
          userMessage(
            `${SOURCE_LABELS[sourceType]}: ${metadata.name}`,
            "attachment",
            metadata,
          ),
        );
      }
      this._refreshUnderstanding();
      return this._applyTurn(this.provider.startTurn(copy(this.state)));
    }

    submit(text) {
      const cleaned = cleanText(text, 2000);
      if (!cleaned) {
        throw new TypeError("Message must not be empty.");
      }
      if (!this.state.sourceType) {
        throw new Error("Dialogue has not been started.");
      }
      this.state.messages.push(userMessage(cleaned));
      return this._applyTurn(
        this.provider.nextTurn(copy(this.state), cleaned),
      );
    }

    continue() {
      if (!["summary", "completed"].includes(this.state.phase)) {
        throw new Error("Project summary is not open.");
      }
      if (typeof this.provider.continueTurn !== "function") {
        throw new TypeError("Intent provider cannot continue the dialogue.");
      }
      return this._applyTurn(this.provider.continueTurn(copy(this.state)));
    }

    correct(text) {
      const cleaned = cleanText(text, 2000);
      if (!cleaned) {
        throw new TypeError("Correction must not be empty.");
      }
      if (this.state.phase !== "summary") {
        throw new Error("Project summary is not open.");
      }
      this.state.messages.push(userMessage(cleaned));
      if (typeof this.provider.correctionTurn === "function") {
        return this._applyTurn(
          this.provider.correctionTurn(copy(this.state), cleaned),
        );
      }
      return this._applyTurn(
        this.provider.nextTurn(
          { ...copy(this.state), dialogMode: "summary-correction" },
          cleaned,
        ),
      );
    }

    addAttachment(kind, attachment) {
      if (!["photo", "pattern"].includes(kind)) {
        throw new TypeError("Unknown attachment kind.");
      }
      const metadata = this._attachmentMetadata(kind, attachment);
      if (!this.state.sourceType) {
        return this.start(kind, metadata);
      }
      if (!this.state.sources.includes(kind)) {
        this.state.sources.push(kind);
      }
      this.state.attachments.push(metadata);
      this.state.messages.push(
        userMessage(
          `${SOURCE_LABELS[kind]}: ${metadata.name}`,
          "attachment",
          metadata,
        ),
      );
      this._refreshUnderstanding();
      if (typeof this.provider.attachmentTurn === "function") {
        return this._applyTurn(
          this.provider.attachmentTurn(copy(this.state), metadata),
        );
      }
      return copy(this.state);
    }

    _attachmentMetadata(kind, attachment) {
      const name = cleanText(attachment?.name, 180);
      if (!name) {
        throw new TypeError("Attachment name is required.");
      }
      return {
        kind,
        name,
        type: cleanText(attachment.type || "", 120),
        size: Number.isFinite(Number(attachment.size))
          ? Number(attachment.size)
          : 0,
      };
    }

    getIntent() {
      return copy(this.state.projectIntent);
    }

    getSummary() {
      return copy(this.state.summary);
    }

    snapshot() {
      return copy(this.state);
    }

    serialize() {
      return JSON.stringify(this.state);
    }

    static restore(serialized, provider = new RuleBasedProvider()) {
      return new ProjectUnderstandingEngine(
        provider,
        JSON.parse(serialized),
      );
    }
  }

  class RuleBasedDialogueProvider extends RuleBasedProvider {}
  class DialogueEngine extends ProjectUnderstandingEngine {}

  const publicApi = {
    DialogueEngine,
    IntentProvider,
    INTENT_SCHEMA_VERSION,
    MAX_FILE_BYTES,
    ProjectUnderstandingEngine,
    RuleBasedDialogueProvider,
    RuleBasedProvider,
    SOURCE_LABELS: copy(SOURCE_LABELS),
    STATE_VERSION,
    questionCount,
  };
  globalObject.YarnAIIntentEngine = publicApi;
  globalObject.YarnAIFirstUserFlow = publicApi;

  if (typeof module !== "undefined" && module.exports) {
    module.exports = publicApi;
  }
})(typeof window !== "undefined" ? window : globalThis);
