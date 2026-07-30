"use strict";

(function exposeSmartStartState(globalObject) {
  const CALCULATION_STORAGE_KEY = "yarnai.smartStart.calculation.v1";
  const PROGRESS_STORAGE_PREFIX = "yarnai.smartStart.progress.v1.";
  const VERSION = 1;
  const STEP_COUNT = 6;

  function createCalculation(result) {
    if (
      !isRecord(result) ||
      result.final !== true ||
      (result.status !== "READY" &&
        result.status !== "READY_WITH_WARNINGS")
    ) {
      return null;
    }

    const candidate = readPath(
      result,
      "axes",
      "width",
      "selected_candidate",
    );
    const request = readPath(
      result,
      "normalized_inputs",
      "original_request",
    );
    const gaugeAssessment = readPath(result, "gauges", "width");
    if (!isRecord(candidate) || !isRecord(request)) {
      return null;
    }

    const workingCount = candidate.working_count;
    if (
      !Number.isInteger(workingCount) ||
      workingCount <= 0
    ) {
      return null;
    }

    const width = isRecord(request.width) ? request.width : {};
    const gaugeInput = isRecord(width.gauge) ? width.gauge : {};
    const fabric = isRecord(request.fabric_context)
      ? request.fabric_context
      : {};
    const gauge = isRecord(gaugeAssessment) ? gaugeAssessment : {};

    const data = {
      version: VERSION,
      workingCount,
      width: compactRecord({
        value: safeScalar(width.value),
        unit: safeString(width.unit),
        sizeKind: safeString(width.size_kind),
      }),
      gauge: compactRecord({
        readyCount: safeScalar(gauge.ready_count ?? gaugeInput.ready_count),
        baseLength: safeScalar(
          gaugeInput.base_length ?? gauge.base_length_cm,
        ),
        baseUnit: safeString(gaugeInput.base_unit ?? width.unit),
        source: safeString(gauge.source ?? gaugeInput.source),
      }),
      materials: compactRecord({
        yarn: safeString(fabric.yarn),
        needleMm: safeScalar(fabric.needle_mm),
        needleType: safeString(fabric.needle_type),
      }),
      context: compactRecord({
        pattern: safeString(request.zone_pattern),
        knittingMode: safeString(request.knitting_mode),
      }),
    };

    data.fingerprint = fingerprintCalculation(data);
    data.createdAt = new Date().toISOString();
    return data;
  }

  function fingerprintCalculation(calculation) {
    const payload = {
      version: calculation.version,
      workingCount: calculation.workingCount,
      width: calculation.width,
      gauge: calculation.gauge,
      materials: calculation.materials,
      context: calculation.context,
    };
    const input = JSON.stringify(payload);
    let first = 0x811c9dc5;
    let second = 0x9e3779b9;

    for (let index = 0; index < input.length; index += 1) {
      const code = input.charCodeAt(index);
      first ^= code;
      first = Math.imul(first, 0x01000193);
      second ^= code + index;
      second = Math.imul(second, 0x85ebca6b);
    }

    return `${hex32(first)}${hex32(second)}`;
  }

  function isValidCalculation(calculation) {
    if (
      !isRecord(calculation) ||
      calculation.version !== VERSION ||
      !Number.isInteger(calculation.workingCount) ||
      calculation.workingCount <= 0 ||
      typeof calculation.fingerprint !== "string" ||
      typeof calculation.createdAt !== "string"
    ) {
      return false;
    }

    for (const key of ["width", "gauge", "materials", "context"]) {
      if (!isRecord(calculation[key])) {
        return false;
      }
    }

    return fingerprintCalculation(calculation) === calculation.fingerprint;
  }

  function saveCurrentCalculation(storage, calculation) {
    if (!isValidCalculation(calculation)) {
      return false;
    }
    return safely(() => {
      storage.setItem(
        CALCULATION_STORAGE_KEY,
        JSON.stringify(calculation),
      );
      return true;
    }, false);
  }

  function readCurrentCalculation(storage, expectedFingerprint = "") {
    return safely(() => {
      const raw = storage.getItem(CALCULATION_STORAGE_KEY);
      if (raw === null) {
        return null;
      }
      const calculation = JSON.parse(raw);
      if (
        !isValidCalculation(calculation) ||
        (expectedFingerprint &&
          calculation.fingerprint !== expectedFingerprint)
      ) {
        return null;
      }
      return calculation;
    }, null);
  }

  function initialProgress(fingerprint) {
    return {
      version: VERSION,
      fingerprint,
      currentStep: 0,
      completed: false,
      lastUpdated: new Date().toISOString(),
    };
  }

  function readProgress(storage, fingerprint) {
    return safely(() => {
      const raw = storage.getItem(progressKey(fingerprint));
      if (raw === null) {
        return initialProgress(fingerprint);
      }
      const progress = JSON.parse(raw);
      return isValidProgress(progress, fingerprint)
        ? progress
        : initialProgress(fingerprint);
    }, initialProgress(fingerprint));
  }

  function saveProgress(storage, progress) {
    if (!isValidProgress(progress, progress?.fingerprint)) {
      return false;
    }
    progress.lastUpdated = new Date().toISOString();
    return safely(() => {
      storage.setItem(
        progressKey(progress.fingerprint),
        JSON.stringify(progress),
      );
      return true;
    }, false);
  }

  function advanceProgress(progress) {
    if (!isValidProgress(progress, progress?.fingerprint)) {
      return progress;
    }
    if (progress.currentStep === STEP_COUNT - 1) {
      progress.completed = true;
    } else {
      progress.currentStep += 1;
    }
    return progress;
  }

  function goBackProgress(progress) {
    if (!isValidProgress(progress, progress?.fingerprint)) {
      return progress;
    }
    progress.completed = false;
    progress.currentStep = Math.max(0, progress.currentStep - 1);
    return progress;
  }

  function resetProgress(storage, fingerprint) {
    safely(() => storage.removeItem(progressKey(fingerprint)));
    return initialProgress(fingerprint);
  }

  function isValidProgress(progress, fingerprint) {
    return (
      typeof fingerprint === "string" &&
      fingerprint.length > 0 &&
      isRecord(progress) &&
      progress.version === VERSION &&
      progress.fingerprint === fingerprint &&
      Number.isInteger(progress.currentStep) &&
      progress.currentStep >= 0 &&
      progress.currentStep < STEP_COUNT &&
      typeof progress.completed === "boolean" &&
      typeof progress.lastUpdated === "string"
    );
  }

  function progressKey(fingerprint) {
    return `${PROGRESS_STORAGE_PREFIX}${fingerprint}`;
  }

  function compactRecord(record) {
    return Object.fromEntries(
      Object.entries(record).filter(([, value]) => value !== undefined),
    );
  }

  function safeScalar(value) {
    return typeof value === "string" || Number.isFinite(value)
      ? value
      : undefined;
  }

  function safeString(value) {
    return typeof value === "string" && value.trim()
      ? value.trim()
      : undefined;
  }

  function readPath(value, ...keys) {
    let current = value;
    for (const key of keys) {
      if (!isRecord(current)) {
        return undefined;
      }
      current = current[key];
    }
    return current;
  }

  function isRecord(value) {
    return value !== null && typeof value === "object" && !Array.isArray(value);
  }

  function hex32(value) {
    return (value >>> 0).toString(16).padStart(8, "0");
  }

  function safely(action, fallback) {
    try {
      return action();
    } catch {
      return fallback;
    }
  }

  const api = Object.freeze({
    CALCULATION_STORAGE_KEY,
    PROGRESS_STORAGE_PREFIX,
    STEP_COUNT,
    createCalculation,
    fingerprintCalculation,
    isValidCalculation,
    saveCurrentCalculation,
    readCurrentCalculation,
    initialProgress,
    readProgress,
    saveProgress,
    advanceProgress,
    goBackProgress,
    resetProgress,
  });

  globalObject.YarnAISmartStartState = api;
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
})(typeof globalThis === "undefined" ? window : globalThis);
