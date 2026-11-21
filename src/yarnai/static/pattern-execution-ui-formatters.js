"use strict";

(function initializePatternExecutionUiFormatters(globalObject) {
  const BRANCHES = Object.freeze({
    body_length: Object.freeze({ label: "Длина изделия", values: Object.freeze({ regular: "стандартная" }) }),
    neckline_method: Object.freeze({ label: "Горловина", values: Object.freeze({ ribbing_last: "резинка выполняется в конце" }) }),
    short_rows: Object.freeze({ label: "Укороченные ряды", values: Object.freeze({ include: "включены" }) }),
    sleeve_length: Object.freeze({ label: "Рукава", values: Object.freeze({ long: "длинные" }) }),
  });
  const STATUS = Object.freeze({
    plan: Object.freeze({ waiting: "Ожидание принятой адаптации", planning: "План строится", ready: "План готов", blocked: "План заблокирован", stale: "План устарел", failed: "Ошибка плана" }),
    component: Object.freeze({ planned: "Запланировано", ready: "Готово", blocked: "Заблокировано", completed: "Завершено" }),
    phase: Object.freeze({ planned: "Запланировано", ready: "Готово", blocked: "Заблокировано", completed: "Завершено" }),
    prerequisite: Object.freeze({ satisfied: "Готово", required: "Требуется", unresolved: "Не подтверждено", not_applicable: "Не применяется" }),
    session: Object.freeze({ waiting: "Вязание ещё не начато", starting: "Подготовка", active: "Вязание выполняется", paused: "Вязание приостановлено", blocked: "Вязание заблокировано", completed: "Вязание завершено", stale: "Сессия устарела", failed: "Ошибка сессии" }),
    action: Object.freeze({ pending: "Ожидает", available: "Доступно", in_progress: "Выполняется", completed: "Выполнено", skipped: "Пропущено", blocked: "Заблокировано" }),
    virtual: Object.freeze({ ready: "Готово к проверке", active: "Проверка плана", completed: "Проверка завершена" }),
  });
  const ROLES = Object.freeze({
    yoke: "кокетка", body: "корпус", right_sleeve: "правый рукав", left_sleeve: "левый рукав", neckline: "горловина", finishing: "завершение",
  });

  function hasNumber(value) {
    return value !== null && value !== undefined && value !== "" && Number.isFinite(Number(value));
  }

  function localizedNumber(value) {
    if (value === null || value === undefined || value === "") return "не указано";
    const number = Number(value);
    if (!Number.isFinite(number)) return "значение не распознано";
    return String(number).replace(".", ",");
  }

  function plural(value, one, few, many) {
    const number = Number(value);
    if (!Number.isInteger(number)) return few;
    const lastTwo = Math.abs(number) % 100;
    const last = Math.abs(number) % 10;
    if (lastTwo >= 11 && lastTwo <= 14) return many;
    if (last === 1) return one;
    if (last >= 2 && last <= 4) return few;
    return many;
  }

  function formatMeasurement(value, unit) {
    const number = localizedNumber(value);
    if (unit === "mm") return `${number} мм`;
    if (unit === "cm") return `${number} см`;
    if (unit === "in") return `${number} ${plural(value, "дюйм", "дюйма", "дюймов")}`;
    return `${number} — единица измерения не распознана; см. «Технические данные»`;
  }

  function formatKnittingText(value) {
    if (value === null || value === undefined) return "";
    return String(value)
      .replace(/(-?\d+(?:\.\d+)?)\s*mm\b/gi, (_match, number) => `${localizedNumber(number)} мм`)
      .replace(/(-?\d+(?:\.\d+)?)\s*in\b/gi, (_match, number) => `${localizedNumber(number)} ${plural(Number(number), "дюйм", "дюйма", "дюймов")}`)
      .replace(/(-?\d+)\s+stitches\b/gi, (_match, number) => `${number} ${plural(Number(number), "петля", "петли", "петель")}`);
  }

  function formatNeedle(value) {
    if (value && typeof value === "object" && !Array.isArray(value)) {
      const role = ({ smaller: "меньшие", larger: "большие" })[value.role] || "подтверждённые";
      return value.value === null || value.value === undefined ? role : `${role} (${formatMeasurement(value.value, value.unit || "mm")})`;
    }
    if (typeof value === "string") {
      const match = value.trim().match(/^(-?\d+(?:\.\d+)?)\s*(mm|cm|in)$/i);
      return match ? formatMeasurement(match[1], match[2].toLowerCase()) : "значение спиц не распознано — см. «Технические данные»";
    }
    return "по подтверждённому плану";
  }

  function formatNeedles(values) {
    const list = Array.isArray(values) ? values : [values];
    const formatted = list.filter((value) => value !== null && value !== undefined).map(formatNeedle);
    return formatted.length ? formatted.join(" и ") : "не указаны";
  }

  function formatGauge(value) {
    const entries = Array.isArray(value) ? value : [value];
    const formatted = entries.filter(Boolean).map((entry) => {
      if (typeof entry !== "object" || entry.unit !== "cm" || !hasNumber(entry.stitches) || !hasNumber(entry.rows) || !hasNumber(entry.per)) {
        return "значение плотности не распознано — см. «Технические данные»";
      }
      return `${localizedNumber(entry.stitches)} ${plural(Number(entry.stitches), "петля", "петли", "петель")} × ${localizedNumber(entry.rows)} ${plural(Number(entry.rows), "ряд", "ряда", "рядов")} в ${localizedNumber(entry.per)} см`;
    });
    return formatted.length ? formatted.join("; ") : "не указана";
  }

  function formatBranches(value) {
    if (!value || typeof value !== "object" || Array.isArray(value)) return [{ label: "Решения", value: "не указаны", known: false }];
    const result = [];
    const handled = new Set();
    for (const key of Object.keys(BRANCHES)) {
      if (!Object.prototype.hasOwnProperty.call(value, key)) continue;
      handled.add(key);
      const definition = BRANCHES[key];
      const translated = definition.values[value[key]];
      result.push({ label: definition.label, value: translated || "значение не распознано — см. «Технические данные»", known: Boolean(translated) });
    }
    for (const key of Object.keys(value).filter((entry) => !handled.has(entry)).sort()) {
      result.push({ label: "Дополнительное решение", value: "значение не распознано — см. «Технические данные»", known: false, technicalKey: key });
    }
    return result.length ? result : [{ label: "Решения", value: "не указаны", known: false }];
  }

  function formatPutUp(value) {
    if (typeof value !== "string" || !value.trim()) return null;
    return value.trim().replace(/\bm\b/gi, "м").replace(/\bg\b/gi, "г").replace(/\s*\/\s*/g, "/");
  }

  function formatYarn(value) {
    if (!value || typeof value !== "object" || Array.isArray(value)) return "не указана";
    const parts = [];
    if (typeof value.composition === "string" && value.composition.trim()) parts.push(value.composition.trim());
    const putUp = formatPutUp(value.putUp);
    if (putUp) parts.push(putUp);
    const weight = (Array.isArray(value.weight) ? value.weight : [value.weight]).find((entry) => typeof entry === "string" && entry.trim());
    if (weight) parts.push(`${weight.trim()} — сохранённая категория толщины пряжи`);
    if (hasNumber(value.quantity)) parts.push(`${localizedNumber(value.quantity)} ${plural(Number(value.quantity), "моток", "мотка", "мотков")}`);
    return parts.length ? parts.join(", ") : "значение не распознано — см. «Технические данные»";
  }

  function formatRepeat(value) {
    if (!value || typeof value !== "object" || Array.isArray(value)) return null;
    if (value.group === "raglan" && hasNumber(value.ordinal) && hasNumber(value.total)) return `Повтор реглана: ${value.ordinal} из ${value.total}`;
    if (value.group === "short_rows" && hasNumber(value.physicalRowOrdinal) && hasNumber(value.totalPhysicalRows)) return `Укороченные ряды: физический ряд ${value.physicalRowOrdinal} из ${value.totalPhysicalRows}`;
    if (["right_sleeve_decreases", "left_sleeve_decreases"].includes(value.group) && hasNumber(value.ordinal) && hasNumber(value.total)) {
      const side = value.group.startsWith("right") ? "правого" : "левого";
      const cycle = hasNumber(value.cycleRounds) ? `; цикл — ${value.cycleRounds} ${plural(Number(value.cycleRounds), "круг", "круга", "кругов")}` : "";
      return `Убавки ${side} рукава: ${value.ordinal} из ${value.total}${cycle}`;
    }
    if (["right_sleeve_cycle", "left_sleeve_cycle"].includes(value.group) && hasNumber(value.rounds)) {
      const side = value.group.startsWith("right") ? "правого" : "левого";
      return `Ровная часть ${side} рукава: ${value.rounds} ${plural(Number(value.rounds), "круг", "круга", "кругов")} без убавок`;
    }
    return "Дополнительный повтор — см. «Технические данные»";
  }

  function formatCheckpointValue(value, unit) {
    if (unit === "stitches") {
      const number = Number(value);
      if (!Number.isFinite(number)) return "значение петель не распознано — см. «Технические данные»";
      const base = `${localizedNumber(number)} ${plural(number, "петля", "петли", "петель")}`;
      return number === 0 ? `${base} — активных петель этого компонента не осталось` : base;
    }
    if (unit) return `${localizedNumber(value)} — единица не распознана; см. «Технические данные»`;
    return localizedNumber(value);
  }

  function statusLabel(kind, value) {
    const translated = STATUS[kind]?.[value];
    return translated || "Статус не распознан — см. «Технические данные»";
  }

  function roleLabel(value) {
    return ROLES[value] || "роль не распознана — см. «Технические данные»";
  }

  function technicalValue(value) {
    if (value === null || value === undefined || value === "") return "не указано";
    if (Array.isArray(value)) return value.length ? value.map(technicalValue).join(", ") : "нет";
    if (typeof value === "object") return Object.keys(value).sort().map((key) => `${key}: ${technicalValue(value[key])}`).join("; ");
    return String(value);
  }

  globalObject.YarnAIPatternExecutionUiFormatters = Object.freeze({
    formatBranches,
    formatCheckpointValue,
    formatGauge,
    formatKnittingText,
    formatMeasurement,
    formatNeedle,
    formatNeedles,
    formatRepeat,
    formatYarn,
    localizedNumber,
    roleLabel,
    statusLabel,
    technicalValue,
  });
})(typeof window !== "undefined" ? window : {});
