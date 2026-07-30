(function (globalObject) {
  "use strict";

  const REQUIRED_PARAMETERS = Object.freeze([
    "width-value",
    "width-unit",
    "size-kind",
    "direction",
    "gauge-count",
    "gauge-length",
    "gauge-unit",
    "measurement-count",
    "gauge-source",
    "functional-category",
    "knitting-mode",
    "zone-pattern",
    "pattern-class",
    "zone-homogeneous",
    "off-needles",
    "processing-state",
    "fully-dry",
    "rest-hours",
    "measurement-state",
    "swatch-mode",
    "heavy-or-large",
    "yarn",
    "yarn-batch",
    "strands",
    "strands-description",
    "needle-mm",
    "needle-type",
    "fabric-pattern",
    "fabric-mode",
    "fabric-processing",
  ]);

  const POSITIVE_NUMBER_PARAMETERS = Object.freeze([
    "width-value",
    "gauge-count",
    "gauge-length",
    "measurement-count",
    "strands",
    "needle-mm",
  ]);

  function readTransfer(search) {
    const parameters = new URLSearchParams(search);
    const present = REQUIRED_PARAMETERS.filter((name) => parameters.has(name));

    if (present.length === 0) {
      return {
        state: "absent",
        values: {},
        missing: [...REQUIRED_PARAMETERS],
        damaged: [],
      };
    }

    const values = {};
    const missing = [];
    const damaged = [];

    REQUIRED_PARAMETERS.forEach((name) => {
      const occurrences = parameters.getAll(name);
      const value = occurrences[0]?.trim() ?? "";
      if (occurrences.length === 0 || value === "") {
        missing.push(name);
        return;
      }
      if (occurrences.length > 1 || value.includes("\uFFFD")) {
        damaged.push(name);
        return;
      }
      values[name] = value;
    });

    if (missing.length > 0) {
      return { state: "missing", values, missing, damaged };
    }

    POSITIVE_NUMBER_PARAMETERS.forEach((name) => {
      const number = Number(values[name]);
      if (!Number.isFinite(number) || number <= 0) {
        damaged.push(name);
      }
    });

    const restHours = Number(values["rest-hours"]);
    if (!Number.isFinite(restHours) || restHours < 0) {
      damaged.push("rest-hours");
    }

    return {
      state: damaged.length > 0 ? "damaged" : "ready",
      values,
      missing,
      damaged: [...new Set(damaged)],
    };
  }

  function resultDetails(data) {
    const width = record(data?.axes)?.width;
    const candidate = record(width)?.selected_candidate;
    const gauge = record(record(data?.gauges)?.width);
    const swatch = record(gauge?.swatch_context);
    const workingCount = candidate?.working_count;

    if (
      !Number.isFinite(workingCount) ||
      !displayNumber(candidate?.actual_size_original_unit) ||
      typeof candidate?.original_unit !== "string" ||
      !displayNumber(gauge?.ready_count) ||
      !displayNumber(gauge?.base_length_cm) ||
      !displayNumber(gauge?.density_per_cm)
    ) {
      return null;
    }

    return {
      workingCount,
      workingWidth: {
        value: candidate.actual_size_original_unit,
        unit: candidate.original_unit,
      },
      gauge: {
        readyCount: gauge.ready_count,
        baseLengthCm: gauge.base_length_cm,
        densityPerCm: gauge.density_per_cm,
      },
      swatch: {
        source: stringOrEmpty(gauge.source),
        measurementCount: gauge.measurement_count,
        quality: stringOrEmpty(gauge.quality),
        canonical: gauge.canonical === true,
        offNeedles: stringOrEmpty(swatch?.off_needles),
        processingState: stringOrEmpty(swatch?.processing_state),
        fullyDry: stringOrEmpty(swatch?.fully_dry),
        restHours: swatch?.rest_hours,
        measurementState: stringOrEmpty(swatch?.measurement_state),
      },
    };
  }

  function diagnostics(items, fallback) {
    if (!Array.isArray(items)) {
      return [];
    }
    return items
      .filter((item) => record(item))
      .map((item) => ({
        reason:
          typeof item.reason === "string" && item.reason.trim()
            ? item.reason
            : fallback,
        nextAction:
          typeof item.next_action === "string" ? item.next_action.trim() : "",
      }));
  }

  function displayNumber(value) {
    if (
      (typeof value !== "string" && typeof value !== "number") ||
      String(value).trim() === ""
    ) {
      return false;
    }
    return Number.isFinite(Number(value));
  }

  function record(value) {
    return value && typeof value === "object" && !Array.isArray(value)
      ? value
      : null;
  }

  function stringOrEmpty(value) {
    return typeof value === "string" ? value : "";
  }

  const publicApi = {
    REQUIRED_PARAMETERS,
    diagnostics,
    readTransfer,
    resultDetails,
  };

  globalObject.YarnAICalculatorResult = publicApi;
  if (typeof module !== "undefined" && module.exports) {
    module.exports = publicApi;
  }
})(typeof window !== "undefined" ? window : globalThis);
