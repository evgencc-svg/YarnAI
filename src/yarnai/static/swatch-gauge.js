"use strict";

(function exposeSwatchGauge(globalObject) {
  const FORMAT = "yarnai-confirmed-swatch-gauge";
  const VERSION = 1;
  const HISTORY_FORMAT = "yarnai-swatch-gauge-history";
  const HISTORY_VERSION = 1;
  const HISTORY_KEY = "swatch_gauge_history";
  const DRAFT_FORMAT = "yarnai-swatch-gauge-draft";
  const DRAFT_VERSION = 1;
  const DRAFT_KEY = "swatch_gauge_draft";
  const INCH_IN_CM = 2.54;
  const PHOTO_MIME_ALLOWLIST = Object.freeze(["image/jpeg", "image/png", "image/webp"]);
  const MAX_PHOTO_BYTES = 20 * 1024 * 1024;
  const RECORD_KEYS = Object.freeze([
    "format", "version", "kind", "identity", "projectIdentity",
    "sourceInitializationIdentity", "sourceInitializationFingerprint",
    "lifecycle", "readiness", "snapshot", "createdAt", "confirmedAt",
    "createdBy", "confirmationKey", "fingerprint", "audit",
  ]);

  class SwatchGaugeError extends Error {
    constructor(code, userMessage) {
      super(userMessage);
      this.name = "SwatchGaugeError";
      this.code = code;
      this.userMessage = userMessage;
    }
  }

  function fail(code, message) { throw new SwatchGaugeError(code, message); }
  function isRecord(value) { return Boolean(value) && typeof value === "object" && !Array.isArray(value); }
  function clone(value) { return value === undefined ? undefined : JSON.parse(JSON.stringify(value)); }
  function freeze(value) {
    if (isRecord(value) || Array.isArray(value)) {
      Object.values(value).forEach(freeze);
      Object.freeze(value);
    }
    return value;
  }
  function clean(value, limit = 240) {
    return typeof value === "string" && value.trim() ? value.trim().slice(0, limit) : null;
  }
  function round(value, precision = 2) {
    const factor = 10 ** precision;
    return Math.round((value + Number.EPSILON) * factor) / factor;
  }
  function canonicalize(value) {
    if (value === null || typeof value === "boolean" || typeof value === "string") return JSON.stringify(value);
    if (typeof value === "number") {
      if (!Number.isFinite(value)) fail("NON_FINITE_VALUE", "Swatch data is invalid.");
      return JSON.stringify(Object.is(value, -0) ? 0 : value);
    }
    if (Array.isArray(value)) return `[${value.map(canonicalize).join(",")}]`;
    if (isRecord(value)) return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalize(value[key])}`).join(",")}}`;
    fail("UNSUPPORTED_VALUE", "Swatch data is invalid.");
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
  function exactKeys(value, keys, code) {
    if (!isRecord(value) || canonicalize(Object.keys(value).sort()) !== canonicalize([...keys].sort())) {
      fail(code, "Swatch data is invalid.");
    }
  }
  function numeric(value) {
    if (value === "" || value === null || value === undefined) return null;
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
  }
  function issue(code, field, message, serious = false) {
    return freeze({ code, field, message, requiresAcknowledgement: serious });
  }
  function normalizePreparation(source = {}) {
    return freeze({
      knitted: source.knitted === true,
      washed: source.washed === true,
      dry: source.dry === true,
      unstretched: source.unstretched === true,
      representative: source.representative === true,
      sameYarn: source.sameYarn === true,
      sameTools: source.sameTools === true,
      samePattern: source.samePattern === true,
    });
  }
  function acknowledgements(source) {
    return [...new Set((Array.isArray(source) ? source : []).map((value) => clean(value, 80)).filter(Boolean))].sort();
  }
  function toCentimeters(value, unit) {
    const number = numeric(value);
    if (number === null || !["cm", "in"].includes(unit)) return null;
    return round(unit === "in" ? number * INCH_IN_CM : number, 6);
  }
  function fromCentimeters(value, unit) {
    const number = numeric(value);
    if (number === null || !["cm", "in"].includes(unit)) return null;
    return round(unit === "in" ? number / INCH_IN_CM : number, 6);
  }

  function assessMeasurement(input = {}) {
    const errors = [];
    const warnings = [];
    const assumptions = [];
    const unit = ["cm", "in"].includes(input.unit) ? input.unit : null;
    if (!unit) errors.push(issue("INVALID_UNIT", "unit", "Swatch data is invalid."));
    const values = {
      stitches: numeric(input.stitches), rows: numeric(input.rows),
      width: numeric(input.width), height: numeric(input.height),
    };
    for (const [field, value] of Object.entries(values)) {
      if (value === null) errors.push(issue("INVALID_NUMBER", field, "Swatch data is invalid."));
      else if (value <= 0) errors.push(issue("NON_POSITIVE_VALUE", field, "Swatch data is invalid."));
    }
    if (values.stitches !== null && values.stitches > 10000) errors.push(issue("STITCHES_TOO_LARGE", "stitches", "Swatch data is invalid."));
    if (values.rows !== null && values.rows > 10000) errors.push(issue("ROWS_TOO_LARGE", "rows", "Swatch data is invalid."));
    const widthCm = unit ? toCentimeters(values.width, unit) : null;
    const heightCm = unit ? toCentimeters(values.height, unit) : null;
    if (widthCm !== null && widthCm < 0.5) errors.push(issue("WIDTH_TOO_SMALL", "width", "Swatch data is invalid."));
    if (heightCm !== null && heightCm < 0.5) errors.push(issue("HEIGHT_TOO_SMALL", "height", "Swatch data is invalid."));
    if (widthCm !== null && widthCm > 500) errors.push(issue("WIDTH_TOO_LARGE", "width", "Swatch data is invalid."));
    if (heightCm !== null && heightCm > 500) errors.push(issue("HEIGHT_TOO_LARGE", "height", "Swatch data is invalid."));

    const preparation = normalizePreparation(input.preparation);
    if (!preparation.knitted) errors.push(issue("SWATCH_NOT_KNITTED", "knitted", "Swatch data is invalid."));
    if (!preparation.unstretched) errors.push(issue("SWATCH_STRETCHED", "unstretched", "Swatch data is invalid."));
    if (!preparation.sameYarn) errors.push(issue("YARN_MISMATCH", "sameYarn", "Swatch data is invalid."));
    if (!preparation.sameTools) errors.push(issue("TOOL_MISMATCH", "sameTools", "Swatch data is invalid."));
    if (!preparation.samePattern) errors.push(issue("PATTERN_MISMATCH", "samePattern", "Swatch data is invalid."));
    if (!preparation.washed) warnings.push(issue("SWATCH_NOT_WASHED", "washed", "Swatch data is invalid.", true));
    if (!preparation.dry) warnings.push(issue("SWATCH_NOT_DRY", "dry", "Swatch data is invalid.", true));
    if (!preparation.representative) warnings.push(issue("AREA_NOT_REPRESENTATIVE", "representative", "Swatch data is invalid.", true));
    if (!clean(input.photoId, 180)) warnings.push(issue("PHOTO_MISSING", "photo", "Swatch data is invalid."));
    if (widthCm !== null && widthCm < 5) warnings.push(issue("SMALL_WIDTH", "width", "Swatch data is invalid."));
    if (heightCm !== null && heightCm < 5) warnings.push(issue("SMALL_HEIGHT", "height", "Swatch data is invalid."));
    if (values.stitches !== null && values.stitches < 10) warnings.push(issue("LOW_STITCH_COUNT", "stitches", "Swatch data is invalid."));
    if (values.rows !== null && values.rows < 10) warnings.push(issue("LOW_ROW_COUNT", "rows", "Swatch data is invalid."));

    let canonical = null;
    let computed = null;
    if (!errors.length) {
      canonical = freeze({ stitches: round(values.stitches, 6), rows: round(values.rows, 6), widthCm, heightCm });
      computed = freeze({
        stitchesPerCm: round(values.stitches / widthCm, 6),
        rowsPerCm: round(values.rows / heightCm, 6),
        stitchesPer10CmExact: round(values.stitches * 10 / widthCm, 6),
        rowsPer10CmExact: round(values.rows * 10 / heightCm, 6),
        stitchesPer10Cm: round(values.stitches * 10 / widthCm),
        rowsPer10Cm: round(values.rows * 10 / heightCm),
      });
      if (computed.stitchesPer10Cm < 2) warnings.push(issue("UNUSUALLY_LOW_STITCH_GAUGE", "stitches", "Swatch data is invalid.", true));
      if (computed.stitchesPer10Cm > 100) warnings.push(issue("UNUSUALLY_HIGH_STITCH_GAUGE", "stitches", "Swatch data is invalid.", true));
      if (computed.rowsPer10Cm < 2) warnings.push(issue("UNUSUALLY_LOW_ROW_GAUGE", "rows", "Swatch data is invalid.", true));
      if (computed.rowsPer10Cm > 150) warnings.push(issue("UNUSUALLY_HIGH_ROW_GAUGE", "rows", "Swatch data is invalid.", true));
    }
    if (unit === "in") assumptions.push(issue("CANONICAL_CM", "unit", "Swatch data is invalid."));
    const acknowledged = acknowledgements(input.acknowledgedWarningCodes);
    const required = warnings.filter((item) => item.requiresAcknowledgement).map((item) => item.code).sort();
    const missing = required.filter((code) => !acknowledged.includes(code));
    return freeze({
      valid: errors.length === 0,
      canConfirm: errors.length === 0 && missing.length === 0,
      readiness: errors.length ? "blocked" : required.length ? "conditionally-ready" : "ready",
      errors, warnings, assumptions, requiredAcknowledgements: required,
      missingAcknowledgements: missing, canonical, computed, preparation,
      input: { stitches: values.stitches, rows: values.rows, width: values.width, height: values.height, unit },
    });
  }

  function buildSourceSnapshot(input = {}) {
    const value = {
      projectIdentity: clean(input.projectIdentity, 180),
      initializationIdentity: clean(input.initializationIdentity, 180),
      initializationFingerprint: clean(input.initializationFingerprint, 180),
      yarn: clean(input.yarn), tool: clean(input.tool), technique: clean(input.technique),
      pattern: clean(input.pattern), recipient: clean(input.recipient), size: clean(input.size),
    };
    if (!value.projectIdentity || !value.initializationIdentity || !value.initializationFingerprint) {
      fail("SOURCE_IDENTITY_MISSING", "Swatch data is invalid.");
    }
    return freeze(value);
  }
  function sourceFingerprint(input) { return fingerprint(buildSourceSnapshot(input)); }

  function buildDraft(input = {}, metadata = {}) {
    const assessment = assessMeasurement(input);
    const source = buildSourceSnapshot(metadata.source);
    const draft = {
      format: DRAFT_FORMAT, version: DRAFT_VERSION, projectIdentity: source.projectIdentity,
      sourceFingerprint: fingerprint(source), measurementInput: clone(assessment.input),
      preparation: clone(assessment.preparation),
      acknowledgedWarningCodes: acknowledgements(input.acknowledgedWarningCodes),
      photoId: clean(input.photoId, 180), updatedAt: clean(metadata.updatedAt, 40),
    };
    if (!draft.updatedAt) fail("DRAFT_TIME_MISSING", "Swatch data is invalid.");
    return freeze(draft);
  }
  function validateDraft(source, options = {}) {
    exactKeys(source, ["format", "version", "projectIdentity", "sourceFingerprint", "measurementInput", "preparation", "acknowledgedWarningCodes", "photoId", "updatedAt"], "MALFORMED_DRAFT");
    if (source.format !== DRAFT_FORMAT || source.version !== DRAFT_VERSION) fail("UNSUPPORTED_DRAFT", "Swatch data is invalid.");
    if (options.projectIdentity && source.projectIdentity !== options.projectIdentity) fail("PROJECT_SCOPE_MISMATCH", "Swatch data is invalid.");
    if (!clean(source.sourceFingerprint, 180) || !clean(source.updatedAt, 40) || !isRecord(source.measurementInput) || !isRecord(source.preparation) || !Array.isArray(source.acknowledgedWarningCodes)) fail("MALFORMED_DRAFT", "Swatch data is invalid.");
    return freeze(clone(source));
  }

  function recordFingerprintInput(source) {
    const value = clone(source);
    delete value.fingerprint;
    return value;
  }
  function buildConfirmedRecord(input = {}, metadata = {}) {
    const assessment = assessMeasurement(input);
    if (!assessment.canConfirm) fail(assessment.errors[0]?.code || "ACKNOWLEDGEMENT_REQUIRED", assessment.errors[0]?.message || "Warnings must be acknowledged.");
    const source = buildSourceSnapshot(metadata.source);
    const identity = clean(metadata.identity, 180);
    const confirmedAt = clean(metadata.confirmedAt, 40);
    if (!identity || !confirmedAt) fail("CONFIRMATION_METADATA_MISSING", "Swatch data is invalid.");
    const acknowledged = acknowledgements(input.acknowledgedWarningCodes).filter((code) => assessment.warnings.some((item) => item.code === code));
    const snapshot = {
      source: clone(source),
      measurement: { input: clone(assessment.input), canonical: clone(assessment.canonical) },
      computed: clone(assessment.computed),
      unitPolicy: { canonical: "cm", accepted: ["cm", "in"], inchesToCm: INCH_IN_CM },
      roundingPolicy: { internalDecimals: 6, displayDecimals: 2, method: "half-up-with-epsilon" },
      preparation: clone(assessment.preparation), warnings: clone(assessment.warnings),
      acknowledgedWarnings: acknowledged, assumptions: clone(assessment.assumptions),
      provenance: { kind: "user-measured-swatch", photoRole: clean(input.photoId, 180) ? "user-material" : "none", aiAnalysis: false },
      linkedPhotoIdentity: clean(input.photoId, 180),
    };
    const confirmationKey = fingerprint({ source, measurement: snapshot.measurement, preparation: snapshot.preparation, photo: snapshot.linkedPhotoIdentity });
    const value = {
      format: FORMAT, version: VERSION, kind: "SWATCH_GAUGE_CONFIRMATION", identity,
      projectIdentity: source.projectIdentity, sourceInitializationIdentity: source.initializationIdentity,
      sourceInitializationFingerprint: source.initializationFingerprint,
      lifecycle: "confirmed", readiness: assessment.readiness, snapshot,
      createdAt: confirmedAt, confirmedAt, createdBy: clean(metadata.createdBy, 120) || "Swatch data is invalid.",
      confirmationKey, fingerprint: "",
      audit: { explicitConfirmation: true, historyVersion: HISTORY_VERSION, source: "swatch-assistant" },
    };
    value.fingerprint = fingerprint(recordFingerprintInput(value));
    return validateConfirmedRecord(value, { projectIdentity: source.projectIdentity });
  }

  function validateConfirmedRecord(source, options = {}) {
    exactKeys(source, RECORD_KEYS, "MALFORMED_GAUGE_RECORD");
    const value = clone(source);
    if (value.format !== FORMAT || value.version !== VERSION || value.kind !== "SWATCH_GAUGE_CONFIRMATION") fail("UNSUPPORTED_GAUGE_RECORD", "Swatch data is invalid.");
    if (value.lifecycle !== "confirmed" || !["ready", "conditionally-ready"].includes(value.readiness)) fail("UNKNOWN_GAUGE_LIFECYCLE", "Swatch data is invalid.");
    if (!clean(value.identity, 180) || !clean(value.projectIdentity, 180) || !clean(value.sourceInitializationIdentity, 180) || !clean(value.sourceInitializationFingerprint, 180)) fail("GAUGE_IDENTITY_MISSING", "Swatch data is invalid.");
    if (options.projectIdentity && value.projectIdentity !== options.projectIdentity) fail("PROJECT_SCOPE_MISMATCH", "Swatch data is invalid.");
    const snapshot = value.snapshot;
    exactKeys(snapshot, ["source", "measurement", "computed", "unitPolicy", "roundingPolicy", "preparation", "warnings", "acknowledgedWarnings", "assumptions", "provenance", "linkedPhotoIdentity"], "MALFORMED_GAUGE_SNAPSHOT");
    if (snapshot.source.projectIdentity !== value.projectIdentity || snapshot.source.initializationIdentity !== value.sourceInitializationIdentity || snapshot.source.initializationFingerprint !== value.sourceInitializationFingerprint) fail("SOURCE_IDENTITY_MISMATCH", "Swatch data is invalid.");
    if (!isRecord(snapshot.measurement?.input) || !isRecord(snapshot.measurement?.canonical) || !isRecord(snapshot.computed) || snapshot.unitPolicy?.canonical !== "cm" || snapshot.unitPolicy?.inchesToCm !== INCH_IN_CM || !Array.isArray(snapshot.warnings) || !Array.isArray(snapshot.acknowledgedWarnings) || !Array.isArray(snapshot.assumptions) || snapshot.provenance?.aiAnalysis !== false) fail("MALFORMED_GAUGE_SNAPSHOT", "Swatch data is invalid.");
    const assessment = assessMeasurement({ ...snapshot.measurement.input, preparation: snapshot.preparation, photoId: snapshot.linkedPhotoIdentity, acknowledgedWarningCodes: snapshot.acknowledgedWarnings });
    if (!assessment.canConfirm || canonicalize(assessment.canonical) !== canonicalize(snapshot.measurement.canonical) || canonicalize(assessment.computed) !== canonicalize(snapshot.computed)) fail("GAUGE_CALCULATION_MISMATCH", "Swatch data is invalid.");
    const expectedKey = fingerprint({ source: snapshot.source, measurement: snapshot.measurement, preparation: snapshot.preparation, photo: snapshot.linkedPhotoIdentity });
    if (value.confirmationKey !== expectedKey || value.fingerprint !== fingerprint(recordFingerprintInput(value))) fail("GAUGE_FINGERPRINT_MISMATCH", "Swatch data is invalid.");
    if (value.createdAt !== value.confirmedAt || value.audit?.explicitConfirmation !== true) fail("GAUGE_CONFIRMATION_INVALID", "Swatch data is invalid.");
    return freeze(value);
  }

  function emptyHistory() {
    return { format: HISTORY_FORMAT, version: HISTORY_VERSION, records: [], currentRecordIdentity: null };
  }
  function normalizeHistory(source, options = {}) {
    if (source === null || source === undefined) return freeze(emptyHistory());
    exactKeys(source, ["format", "version", "records", "currentRecordIdentity"], "MALFORMED_GAUGE_HISTORY");
    if (source.format !== HISTORY_FORMAT || source.version !== HISTORY_VERSION || !Array.isArray(source.records)) fail("MALFORMED_GAUGE_HISTORY", "Swatch data is invalid.");
    const identities = new Set();
    const keys = new Set();
    const records = source.records.map((entry) => {
      const checked = validateConfirmedRecord(entry, options);
      if (identities.has(checked.identity)) fail("GAUGE_HISTORY_IDENTITY_COLLISION", "Swatch data is invalid.");
      if (keys.has(checked.confirmationKey)) fail("GAUGE_HISTORY_DUPLICATE", "Swatch data is invalid.");
      identities.add(checked.identity);
      keys.add(checked.confirmationKey);
      return clone(checked);
    });
    if ((records.at(-1)?.identity || null) !== (clean(source.currentRecordIdentity, 180) || null)) fail("GAUGE_HISTORY_CURRENT_MISMATCH", "Swatch data is invalid.");
    return freeze({ format: HISTORY_FORMAT, version: HISTORY_VERSION, records, currentRecordIdentity: records.at(-1)?.identity || null });
  }
  function appendHistory(historySource, recordSource) {
    const history = normalizeHistory(historySource, { projectIdentity: recordSource?.projectIdentity });
    const value = validateConfirmedRecord(recordSource, { projectIdentity: recordSource?.projectIdentity });
    if (history.records.some((entry) => entry.confirmationKey === value.confirmationKey)) return history;
    const records = [...history.records.map(clone), clone(value)];
    return freeze({ format: HISTORY_FORMAT, version: HISTORY_VERSION, records, currentRecordIdentity: value.identity });
  }

  function evaluateRecord(source, currentSource) {
    try {
      const saved = validateConfirmedRecord(source, { projectIdentity: currentSource?.projectIdentity });
      const current = buildSourceSnapshot(currentSource);
      const reasons = [];
      if (saved.snapshot.source.yarn !== current.yarn) reasons.push("Swatch data is invalid.");
      if (saved.snapshot.source.tool !== current.tool) reasons.push("Swatch data is invalid.");
      if (saved.snapshot.source.technique !== current.technique || saved.snapshot.source.pattern !== current.pattern) reasons.push("Swatch data is invalid.");
      if (saved.snapshot.source.initializationIdentity !== current.initializationIdentity || saved.snapshot.source.initializationFingerprint !== current.initializationFingerprint) reasons.push("Swatch data is invalid.");
      if (saved.snapshot.source.recipient !== current.recipient || saved.snapshot.source.size !== current.size) reasons.push("Swatch data is invalid.");
      if (fingerprint(saved.snapshot.source) !== fingerprint(current) && !reasons.length) reasons.push("Swatch data is invalid.");
      return freeze({ valid: true, current: reasons.length === 0, stale: reasons.length > 0, record: saved, staleReasons: reasons, error: null });
    } catch (error) {
      return freeze({ valid: false, current: false, stale: false, record: null, staleReasons: [], error: { code: error.code || "GAUGE_RECORD_INVALID", message: error.userMessage || "Swatch data is invalid." } });
    }
  }
  function selectCurrentRecord(historySource, currentSource) {
    try {
      const history = normalizeHistory(historySource, { projectIdentity: currentSource?.projectIdentity });
      const latest = history.records.at(-1) || null;
      if (!latest) return freeze({ state: "missing", current: null, history, reasons: [] });
      const evaluation = evaluateRecord(latest, currentSource);
      if (!evaluation.valid) return freeze({ state: "blocked", current: null, history, reasons: [evaluation.error] });
      if (evaluation.stale) return freeze({ state: "stale", current: null, history, reasons: evaluation.staleReasons.map((message) => ({ code: "GAUGE_STALE", message })) });
      return freeze({ state: "current", current: evaluation.record, history, reasons: [] });
    } catch (error) {
      return freeze({ state: "blocked", current: null, history: null, reasons: [{ code: error.code || "GAUGE_HISTORY_INVALID", message: error.userMessage || "Swatch data is invalid." }] });
    }
  }

  function safeDestination(value, projectIdentity) {
    try {
      const url = new URL(value, "http://localhost");
      const valid = url.origin === "http://localhost" && url.pathname === "/user-workspace-entry" && url.searchParams.get("project") === projectIdentity && !url.username && !url.password;
      return freeze({ valid, href: valid ? `${url.pathname}?project=${encodeURIComponent(projectIdentity)}` : "" });
    } catch {
      return freeze({ valid: false, href: "" });
    }
  }
  function validatePhoto(file) {
    if (!file || !PHOTO_MIME_ALLOWLIST.includes(file.type)) return { valid: false, code: "PHOTO_MIME_UNSUPPORTED", message: "Swatch data is invalid." };
    if (!Number.isFinite(file.size) || file.size <= 0 || file.size > MAX_PHOTO_BYTES) return { valid: false, code: "PHOTO_SIZE_INVALID", message: "Swatch data is invalid." };
    return { valid: true, code: null, message: "" };
  }

  const api = Object.freeze({
    FORMAT, VERSION, HISTORY_FORMAT, HISTORY_VERSION, HISTORY_KEY,
    DRAFT_FORMAT, DRAFT_VERSION, DRAFT_KEY, INCH_IN_CM,
    PHOTO_MIME_ALLOWLIST, MAX_PHOTO_BYTES, SwatchGaugeError,
    canonicalize, fingerprint, round, toCentimeters, fromCentimeters,
    normalizePreparation, assessMeasurement, buildSourceSnapshot,
    sourceFingerprint, buildDraft, validateDraft, buildConfirmedRecord,
    validateConfirmedRecord, normalizeHistory, appendHistory, evaluateRecord,
    selectCurrentRecord, safeDestination, validatePhoto,
  });
  globalObject.YarnAISwatchGauge = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
