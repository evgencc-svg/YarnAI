"use strict";

(function exposeStepAssistantState(globalObject) {
  const PROGRESS_STORAGE_PREFIX = "yarnai.stepAssistant.progress.v1.";
  const VERSION = 1;

  function initialProgress(fingerprint) {
    return {
      version: VERSION,
      fingerprint,
      currentRow: 1,
      currentStitch: 0,
      completedRows: [],
      lastUpdated: new Date().toISOString(),
    };
  }

  function readProgress(storage, fingerprint, workingCount) {
    return safely(() => {
      const raw = storage.getItem(progressKey(fingerprint));
      if (raw === null) {
        return initialProgress(fingerprint);
      }
      const progress = JSON.parse(raw);
      return isValidProgress(progress, fingerprint, workingCount)
        ? progress
        : initialProgress(fingerprint);
    }, initialProgress(fingerprint));
  }

  function saveProgress(storage, progress, workingCount) {
    if (
      !isValidProgress(
        progress,
        progress?.fingerprint,
        workingCount,
      )
    ) {
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

  function advanceStitch(progress, workingCount) {
    if (
      !isValidProgress(
        progress,
        progress?.fingerprint,
        workingCount,
      ) ||
      progress.currentStitch >= workingCount
    ) {
      return progress;
    }

    progress.currentStitch += 1;
    if (progress.currentStitch === workingCount) {
      progress.completedRows = addCompletedRow(
        progress.completedRows,
        progress.currentRow,
      );
    }
    return progress;
  }

  function goBackStitch(progress, workingCount) {
    if (
      !isValidProgress(
        progress,
        progress?.fingerprint,
        workingCount,
      ) ||
      progress.currentStitch === 0
    ) {
      return progress;
    }

    progress.completedRows = progress.completedRows.filter(
      (row) => row !== progress.currentRow,
    );
    progress.currentStitch -= 1;
    return progress;
  }

  function advanceRow(progress, workingCount) {
    if (
      !isValidProgress(
        progress,
        progress?.fingerprint,
        workingCount,
      ) ||
      progress.currentStitch !== workingCount ||
      !progress.completedRows.includes(progress.currentRow)
    ) {
      return progress;
    }

    progress.currentRow += 1;
    progress.currentStitch = 0;
    return progress;
  }

  function resetProgress(storage, fingerprint) {
    safely(() => storage.removeItem(progressKey(fingerprint)));
    return initialProgress(fingerprint);
  }

  function isValidProgress(progress, fingerprint, workingCount) {
    if (
      typeof fingerprint !== "string" ||
      fingerprint.length === 0 ||
      !Number.isInteger(workingCount) ||
      workingCount <= 0 ||
      !isRecord(progress) ||
      progress.version !== VERSION ||
      progress.fingerprint !== fingerprint ||
      !Number.isInteger(progress.currentRow) ||
      progress.currentRow <= 0 ||
      !Number.isInteger(progress.currentStitch) ||
      progress.currentStitch < 0 ||
      progress.currentStitch > workingCount ||
      !Array.isArray(progress.completedRows) ||
      !isValidTimestamp(progress.lastUpdated)
    ) {
      return false;
    }

    const rows = progress.completedRows;
    const uniqueRows = new Set(rows);
    if (
      uniqueRows.size !== rows.length ||
      rows.some((row) => !Number.isInteger(row) || row <= 0) ||
      rows.some((row) => row > progress.currentRow) ||
      !isAscending(rows)
    ) {
      return false;
    }

    const currentRowCompleted = rows.includes(progress.currentRow);
    if (currentRowCompleted !== (progress.currentStitch === workingCount)) {
      return false;
    }
    for (let row = 1; row < progress.currentRow; row += 1) {
      if (!uniqueRows.has(row)) {
        return false;
      }
    }
    return true;
  }

  function progressKey(fingerprint) {
    return `${PROGRESS_STORAGE_PREFIX}${fingerprint}`;
  }

  function addCompletedRow(rows, row) {
    return [...new Set([...rows, row])].sort((left, right) => left - right);
  }

  function isAscending(values) {
    return values.every(
      (value, index) => index === 0 || values[index - 1] < value,
    );
  }

  function isRecord(value) {
    return value !== null && typeof value === "object" && !Array.isArray(value);
  }

  function isValidTimestamp(value) {
    if (typeof value !== "string") {
      return false;
    }
    const milliseconds = Date.parse(value);
    return (
      Number.isFinite(milliseconds) &&
      new Date(milliseconds).toISOString() === value
    );
  }

  function safely(action, fallback) {
    try {
      return action();
    } catch {
      return fallback;
    }
  }

  const api = Object.freeze({
    PROGRESS_STORAGE_PREFIX,
    initialProgress,
    readProgress,
    saveProgress,
    advanceStitch,
    goBackStitch,
    advanceRow,
    resetProgress,
    isValidProgress,
    progressKey,
  });

  globalObject.YarnAIStepAssistantState = api;
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
})(typeof globalThis === "undefined" ? window : globalThis);
