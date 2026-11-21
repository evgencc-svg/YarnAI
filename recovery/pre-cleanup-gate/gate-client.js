import {
  buildProjectClosure,
  canonicalJson,
  decodeValue,
  encodeValue,
  hashRecords,
  schemaSignature,
  sha256Bytes,
  sha256Text,
} from "../exact-project-handoff/core.mjs";
import {
  DATABASE_NAME,
  EXPECTED_PRODUCTION,
  FIXTURE_TITLE,
  FIXTURES,
  FORMAT_VERSION,
  PROTECTED,
} from "./config.mjs";

const params = new URLSearchParams(location.search);
const mode = params.get("mode") || "production-snapshot";
const run = params.get("run") || `run-${Date.now()}`;
const sourceRun = params.get("sourceRun") || run;
const targetDatabaseName = params.get("targetDatabase") || `yarnai-pre-cleanup-rehearsal-${run}`;
const exactProjectId = params.get("project") || null;
const EXACT_PROJECT_RECOVERY_FORMAT = "YARNAI_EXACT_PROJECT_RECOVERY_V1";
const statusNode = document.querySelector("#status");
const outputNode = document.querySelector("#output");

function show(status, payload) {
  statusNode.textContent = status;
  outputNode.textContent = JSON.stringify(payload, null, 2);
  document.title = `${status} — YarnAI pre-cleanup gate`;
}

function requestResult(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function transactionComplete(transaction) {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = resolve;
    transaction.onabort = () => reject(transaction.error || new Error("TRANSACTION_ABORTED"));
    transaction.onerror = () => {};
  });
}

async function openExistingDatabase(name) {
  if (typeof indexedDB.databases !== "function") throw new Error("INDEXEDDB_DATABASE_ENUMERATION_UNAVAILABLE");
  const databases = await indexedDB.databases();
  if (!databases.some((entry) => entry.name === name)) throw new Error(`DATABASE_NOT_FOUND:${name}`);
  const request = indexedDB.open(name);
  request.onupgradeneeded = () => request.transaction.abort();
  return requestResult(request);
}

async function collectDatabase(name) {
  const database = await openExistingDatabase(name);
  try {
    const storeNames = Array.from(database.objectStoreNames);
    const transaction = database.transaction(storeNames, "readonly");
    const schema = { name: database.name, version: database.version, stores: [] };
    const rawRecords = [];
    for (const storeName of storeNames) {
      const store = transaction.objectStore(storeName);
      schema.stores.push({
        name: storeName,
        keyPath: store.keyPath,
        autoIncrement: store.autoIncrement,
        indexes: Array.from(store.indexNames).map((name) => {
          const index = store.index(name);
          return { name, keyPath: index.keyPath, unique: index.unique, multiEntry: index.multiEntry };
        }),
      });
      await new Promise((resolve, reject) => {
        const cursorRequest = store.openCursor();
        cursorRequest.onerror = () => reject(cursorRequest.error);
        cursorRequest.onsuccess = () => {
          const cursor = cursorRequest.result;
          if (!cursor) return resolve();
          rawRecords.push({ store: storeName, key: cursor.primaryKey, value: cursor.value });
          cursor.continue();
        };
      });
    }
    await transactionComplete(transaction);
    const records = [];
    for (const record of rawRecords) records.push({ store: record.store, key: await encodeValue(record.key), value: await encodeValue(record.value) });
    schema.stores.sort((left, right) => left.name.localeCompare(right.name));
    return { schema, records };
  } finally {
    database.close();
  }
}

function encodedObject(node) {
  return node?.t === "object" ? Object.fromEntries(node.entries) : {};
}

function encodedScalar(node) {
  return ["string", "number", "boolean", "bigint"].includes(node?.t) ? node.v : null;
}

function field(node, ...names) {
  const object = encodedObject(node);
  for (const name of names) {
    const value = encodedScalar(object[name]);
    if (value !== null) return value;
  }
  return null;
}

function storeCounts(records) {
  const counts = {};
  for (const record of records) counts[record.store] = (counts[record.store] || 0) + 1;
  return Object.fromEntries(Object.entries(counts).sort(([left], [right]) => left.localeCompare(right)));
}

async function baselineNormalize(value, seen = new WeakSet()) {
  if (value === null || ["string", "boolean"].includes(typeof value)) return value;
  if (typeof value === "number") {
    if (Number.isNaN(value)) return { __number__: "NaN" };
    if (!Number.isFinite(value)) return { __number__: value > 0 ? "+Infinity" : "-Infinity" };
    if (Object.is(value, -0)) return { __number__: "-0" };
    return value;
  }
  if (typeof value === "undefined") return { __undefined__: true };
  if (typeof value === "bigint") return { __bigint__: value.toString(10) };
  if (seen.has(value)) throw new Error("CYCLIC_VALUE");
  seen.add(value);
  try {
    if (value instanceof Date) return { __date__: value.toISOString() };
    if (value instanceof Blob) {
      const bytes = new Uint8Array(await value.arrayBuffer());
      return { __blob__: true, type: value.type, size: value.size, sha256: await sha256Bytes(bytes) };
    }
    if (value instanceof ArrayBuffer) return { __bytes__: await sha256Bytes(new Uint8Array(value)), length: value.byteLength };
    if (ArrayBuffer.isView(value)) return { __typed_array__: value.constructor.name, sha256: await sha256Bytes(new Uint8Array(value.buffer, value.byteOffset, value.byteLength)), length: value.byteLength };
    if (Array.isArray(value)) {
      const result = [];
      for (const item of value) result.push(await baselineNormalize(item, seen));
      return result;
    }
    if (value instanceof Map) {
      const entries = [];
      for (const [key, item] of value.entries()) entries.push([await baselineNormalize(key, seen), await baselineNormalize(item, seen)]);
      return { __map__: entries };
    }
    if (value instanceof Set) {
      const items = [];
      for (const item of value.values()) items.push(await baselineNormalize(item, seen));
      return { __set__: items };
    }
    const result = {};
    for (const key of Object.keys(value).sort()) result[key] = await baselineNormalize(value[key], seen);
    return result;
  } finally {
    seen.delete(value);
  }
}

async function baselineRecordsHash(records) {
  const normalized = [];
  for (const record of records) normalized.push({
    store: record.store,
    key: await baselineNormalize(decodeValue(record.key)),
    value: await baselineNormalize(decodeValue(record.value)),
  });
  normalized.sort((left, right) => left.store.localeCompare(right.store) || JSON.stringify(left.key).localeCompare(JSON.stringify(right.key)));
  return sha256Text(JSON.stringify(normalized));
}

function projectIdentity(record) {
  return {
    projectId: field(record.value, "project_id"),
    title: field(record.value, "title", "name"),
    revision: field(record.value, "revision"),
    stage: field(record.value, "current_stage", "stage"),
    createdAt: field(record.value, "created_at", "createdAt"),
    updatedAt: field(record.value, "updated_at", "updatedAt"),
  };
}

function affiliationMaps(records) {
  const photos = new Map();
  const patternFiles = new Map();
  for (const record of records) {
    const projectId = field(record.value, "project_id");
    if (record.store === "photos") photos.set(field(record.value, "photo_id"), projectId);
    if (record.store === "pattern_files") patternFiles.set(field(record.value, "pattern_file_id"), projectId);
  }
  return { photos, patternFiles };
}

function projectAffiliation(record, maps) {
  const direct = field(record.value, "project_id");
  if (direct) return { projectId: direct, relation: "value.project_id" };
  if (record.store === "photo_blobs") {
    const relationId = field(record.value, "photo_id");
    return { projectId: maps.photos.get(relationId) || null, relation: `photo_id:${relationId}` };
  }
  if (record.store === "pattern_file_blobs") {
    const relationId = field(record.value, "pattern_file_id");
    return { projectId: maps.patternFiles.get(relationId) || null, relation: `pattern_file_id:${relationId}` };
  }
  return { projectId: null, relation: null };
}

async function recordManifest(records) {
  const maps = affiliationMaps(records);
  const output = [];
  for (const record of records) {
    const affiliation = projectAffiliation(record, maps);
    output.push({
      store: record.store,
      primaryKey: record.key,
      projectId: affiliation.projectId,
      relation: affiliation.relation,
      classification: affiliation.projectId ? "project-scoped" : ["meta", "settings", "cache", "sync_state"].includes(record.store) ? "global/system" : "orphan-or-unscoped",
      valueType: record.value?.t || null,
      recordType: field(record.value, "kind", "type", "record_type", "key"),
      revision: field(record.value, "revision"),
      stage: field(record.value, "current_stage", "stage", "status"),
      createdAt: field(record.value, "created_at", "createdAt"),
      updatedAt: field(record.value, "updated_at", "updatedAt"),
      perRecordLogicalHash: await baselineRecordsHash([record]),
      perRecordLosslessHash: await hashRecords([record]),
    });
  }
  return output.sort((left, right) => left.store.localeCompare(right.store) || canonicalJson(left.primaryKey).localeCompare(canonicalJson(right.primaryKey)));
}

async function projectManifest(snapshot, projectId) {
  const closure = buildProjectClosure(snapshot.records, projectId);
  const projectRecord = closure.records.find((record) => record.store === "projects");
  if (!projectRecord) throw new Error(`PROJECT_RECORD_MISSING:${projectId}`);
  return {
    ...projectIdentity(projectRecord),
    recordCount: closure.records.length,
    storeCounts: storeCounts(closure.records),
    aggregateLogicalHash: await baselineRecordsHash(closure.records),
    aggregateLosslessHash: await hashRecords(closure.records),
  };
}

async function snapshotManifest(snapshot) {
  const projects = [];
  for (const record of snapshot.records.filter((entry) => entry.store === "projects")) projects.push(await projectManifest(snapshot, field(record.value, "project_id")));
  projects.sort((left, right) => left.projectId.localeCompare(right.projectId));
  const records = await recordManifest(snapshot.records);
  return {
    database: snapshot.schema.name,
    version: snapshot.schema.version,
    schema: snapshot.schema,
    schemaSignature: schemaSignature(snapshot.schema),
    storeCounts: storeCounts(snapshot.records),
    totalRecords: snapshot.records.length,
    projectCount: projects.length,
    databaseLogicalHash: await baselineRecordsHash(snapshot.records),
    databaseLosslessHash: await hashRecords(snapshot.records),
    projectIds: projects.map((project) => project.projectId),
    projects,
    records,
  };
}

function assertEqual(actual, expected, code) {
  if (canonicalJson(actual) !== canonicalJson(expected)) throw new Error(`${code}:EXPECTED=${canonicalJson(expected)}:ACTUAL=${canonicalJson(actual)}`);
}

async function validateProduction(snapshot) {
  const manifest = await snapshotManifest(snapshot);
  assertEqual(manifest.projectCount, EXPECTED_PRODUCTION.projectCount, "PROJECT_COUNT_MISMATCH");
  assertEqual(manifest.totalRecords, EXPECTED_PRODUCTION.totalRecords, "TOTAL_RECORDS_MISMATCH");
  assertEqual(manifest.storeCounts, EXPECTED_PRODUCTION.storeCounts, "STORE_COUNTS_MISMATCH");
  assertEqual(manifest.databaseLogicalHash, EXPECTED_PRODUCTION.databaseLogicalHash, "DATABASE_LOGICAL_HASH_MISMATCH");
  for (const expected of [...FIXTURES, PROTECTED.flax, PROTECTED.stage63]) {
    const actual = manifest.projects.find((project) => project.projectId === expected.projectId);
    if (!actual) throw new Error(`EXPECTED_PROJECT_MISSING:${expected.projectId}`);
    assertEqual({ revision: actual.revision, stage: actual.stage, recordCount: actual.recordCount, aggregateLogicalHash: actual.aggregateLogicalHash }, { revision: expected.revision, stage: expected.stage, recordCount: expected.recordCount, aggregateLogicalHash: expected.aggregateLogicalHash }, `PROJECT_CONTRACT_MISMATCH:${expected.projectId}`);
  }
  for (const expected of FIXTURES) {
    const actual = manifest.projects.find((project) => project.projectId === expected.projectId);
    assertEqual(actual.title, FIXTURE_TITLE, `FIXTURE_TITLE_MISMATCH:${expected.projectId}`);
  }
  return manifest;
}

async function postResult(kind, payload) {
  const response = await fetch(`/api/result?run=${encodeURIComponent(run)}&kind=${encodeURIComponent(kind)}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!response.ok) throw new Error(`RESULT_POST_HTTP_${response.status}`);
  return response.json();
}

async function fetchPackage() {
  const response = await fetch(`/api/package?run=${encodeURIComponent(sourceRun)}`, { cache: "no-store" });
  if (!response.ok) throw new Error(`PACKAGE_HTTP_${response.status}`);
  return response.json();
}

async function productionSnapshot() {
  const snapshot = await collectDatabase(DATABASE_NAME);
  const rawManifest = await snapshotManifest(snapshot);
  await postResult("production-snapshot-raw", { status: "PRODUCTION SNAPSHOT CAPTURED", origin: location.origin, mode: "readonly", ...rawManifest });
  const manifest = await validateProduction(snapshot);
  const result = { status: "PRODUCTION SNAPSHOT PASS", origin: location.origin, mode: "readonly", ...manifest };
  await postResult("production-snapshot", result);
  return result;
}

async function fixtureExport() {
  const snapshot = await collectDatabase(DATABASE_NAME);
  const production = await validateProduction(snapshot);
  const selected = [];
  const markers = new Set();
  const projects = [];
  for (const expected of FIXTURES) {
    const closure = buildProjectClosure(snapshot.records, expected.projectId);
    for (const record of closure.records) {
      const marker = `${record.store}:${canonicalJson(record.key)}`;
      if (markers.has(marker)) throw new Error(`DUPLICATE_RECORD_ACROSS_PROJECTS:${marker}`);
      markers.add(marker);
      selected.push(record);
    }
    projects.push(await projectManifest(snapshot, expected.projectId));
  }
  assertEqual(selected.length, 983, "TARGET_RECORD_COUNT_MISMATCH");
  assertEqual(storeCounts(selected), { calculations: 17, checkpoints: 381, operations: 364, progress: 204, projects: 17 }, "TARGET_STORE_COUNTS_MISMATCH");
  const records = await recordManifest(selected);
  const info = await (await fetch("/api/utility-info", { cache: "no-store" })).json();
  const manifestWithoutHash = {
    projectCount: projects.length,
    recordCount: selected.length,
    storeCounts: storeCounts(selected),
    projectIds: projects.map((project) => project.projectId),
    targetedLogicalHash: await baselineRecordsHash(selected),
    targetedLosslessHash: await hashRecords(selected),
    projects,
    records,
    excludedProductionControl: {
      flax: production.projects.find((project) => project.projectId === PROTECTED.flax.projectId),
      stage63: production.projects.find((project) => project.projectId === PROTECTED.stage63.projectId),
      globalRecords: production.records.filter((record) => record.projectId === null),
    },
  };
  const manifest = { ...manifestWithoutHash, manifestLogicalSha256: await sha256Text(canonicalJson(manifestWithoutHash)) };
  const packageWithoutHash = {
    formatVersion: FORMAT_VERSION,
    createdAt: new Date().toISOString(),
    source: { origin: location.origin, database: snapshot.schema.name, version: snapshot.schema.version, schema: snapshot.schema, schemaSignature: schemaSignature(snapshot.schema), databaseLogicalHash: production.databaseLogicalHash },
    utilitySha256: info.utilitySha256,
    manifest,
    records: selected,
  };
  const recoveryPackage = { ...packageWithoutHash, packageLogicalSha256: await sha256Text(canonicalJson(packageWithoutHash)) };
  await postResult("recovery-manifest", manifest);
  await postResult("recovery-package", recoveryPackage);
  const summary = { status: "TARGETED RECOVERY PACKAGE PASS", packageLogicalSha256: recoveryPackage.packageLogicalSha256, manifest: recoveryPackage.manifest };
  await postResult("export-summary", summary);
  return summary;
}

async function exactProjectExport() {
  if (!exactProjectId) throw new Error("PROJECT_ID_REQUIRED");
  const snapshot = await collectDatabase(DATABASE_NAME);
  const production = {
    databaseLogicalHash: await baselineRecordsHash(snapshot.records),
    databaseLosslessHash: await hashRecords(snapshot.records),
    totalRecords: snapshot.records.length,
    projectCount: snapshot.records.filter((entry) => entry.store === "projects").length,
  };
  const closure = buildProjectClosure(snapshot.records, exactProjectId);
  if (closure.projectRecordCount !== 1) throw new Error(`PROJECT_RECORD_COUNT_MISMATCH:${closure.projectRecordCount}`);
  const project = await projectManifest(snapshot, exactProjectId);
  const records = await recordManifest(closure.records);
  const info = await (await fetch("/api/utility-info", { cache: "no-store" })).json();
  const manifestWithoutHash = {
    projectCount: 1,
    recordCount: closure.records.length,
    storeCounts: storeCounts(closure.records),
    projectIds: [exactProjectId],
    targetedLogicalHash: await baselineRecordsHash(closure.records),
    targetedLosslessHash: await hashRecords(closure.records),
    projects: [project],
    records,
    databaseLevelReferences: closure.databaseLevelReferences,
    unknownReferences: closure.unknownReferences,
  };
  const manifest = { ...manifestWithoutHash, manifestLogicalSha256: await sha256Text(canonicalJson(manifestWithoutHash)) };
  const packageWithoutHash = {
    formatVersion: EXACT_PROJECT_RECOVERY_FORMAT,
    createdAt: new Date().toISOString(),
    source: {
      origin: location.origin,
      database: snapshot.schema.name,
      version: snapshot.schema.version,
      schema: snapshot.schema,
      schemaSignature: schemaSignature(snapshot.schema),
      databaseLogicalHash: production.databaseLogicalHash,
      databaseLosslessHash: production.databaseLosslessHash,
      databaseRecordCount: production.totalRecords,
      databaseProjectCount: production.projectCount,
    },
    utilitySha256: info.utilitySha256,
    manifest,
    records: closure.records,
  };
  const recoveryPackage = { ...packageWithoutHash, packageLogicalSha256: await sha256Text(canonicalJson(packageWithoutHash)) };
  await postResult("recovery-manifest", manifest);
  await postResult("recovery-package", recoveryPackage);
  const summary = { status: "EXACT PROJECT RECOVERY PACKAGE PASS", packageLogicalSha256: recoveryPackage.packageLogicalSha256, manifest };
  await postResult("export-summary", summary);
  return summary;
}

async function exactProjectSnapshot() {
  if (!exactProjectId) throw new Error("PROJECT_ID_REQUIRED");
  const snapshot = await collectDatabase(DATABASE_NAME);
  const closure = buildProjectClosure(snapshot.records, exactProjectId);
  if (closure.projectRecordCount !== 1) throw new Error(`PROJECT_RECORD_COUNT_MISMATCH:${closure.projectRecordCount}`);
  const project = await projectManifest(snapshot, exactProjectId);
  const records = await recordManifest(closure.records);
  const manifestWithoutHash = {
    projectCount: 1,
    recordCount: closure.records.length,
    storeCounts: storeCounts(closure.records),
    projectIds: [exactProjectId],
    targetedLogicalHash: await baselineRecordsHash(closure.records),
    targetedLosslessHash: await hashRecords(closure.records),
    projects: [project],
    records,
    databaseLevelReferences: closure.databaseLevelReferences,
    unknownReferences: closure.unknownReferences,
  };
  const manifest = { ...manifestWithoutHash, manifestLogicalSha256: await sha256Text(canonicalJson(manifestWithoutHash)) };
  const progress = closure.records.filter((entry) => entry.store === "progress").map((entry) => decodeValue(entry.value));
  const progressByKind = (kind) => progress.find((entry) => entry.kind === kind) || null;
  const reviewProgress = progressByKind("PATTERN_TECHNOLOGY_REVIEW");
  const planProgress = progressByKind("PATTERN_EXECUTION_PLAN");
  const sessionProgress = progressByKind("PATTERN_EXECUTION_SESSION");
  const session = sessionProgress?.state || null;
  const currentVirtual = session?.virtualDryRun || null;
  const historicalVirtual = session?.historicalVirtualDryRuns?.at(-1) || null;
  async function virtualDiagnostics(virtual) {
    if (!virtual) return null;
    const virtualRecord = [{ store: "virtual_dry_run", key: await encodeValue(virtual.id), value: await encodeValue(virtual) }];
    return {
      id: virtual.id, revision: virtual.revision, status: virtual.status, runFingerprint: virtual.runFingerprint,
      sourceExecutionPlanId: virtual.sourceExecutionPlanId, sourceExecutionPlanRevision: virtual.sourceExecutionPlanRevision,
      sourceExecutionPlanFingerprint: virtual.sourceExecutionPlanFingerprint,
      completedStepCount: virtual.completedStepIds?.length || 0,
      receiptCount: virtual.receipts?.length || 0,
      logicalHash: await baselineRecordsHash(virtualRecord),
      losslessHash: await hashRecords(virtualRecord),
    };
  }
  const diagnostics = {
    stage21: reviewProgress?.state ? {
      id: reviewProgress.state.id, revision: reviewProgress.state.revision, status: reviewProgress.state.status,
      confirmedSnapshotFingerprint: reviewProgress.state.confirmedSnapshotFingerprint,
      resultFingerprint: reviewProgress.state.resultFingerprint,
    } : null,
    stage22: planProgress?.state ? {
      id: planProgress.state.id, revision: planProgress.state.revision, status: planProgress.state.status,
      planFingerprint: planProgress.state.planFingerprint,
      planningInputFingerprint: planProgress.state.planningInputFingerprint,
    } : null,
    physicalSessionProgressRevision: sessionProgress?.revision ?? null,
    physicalSession: session ? {
      id: session.id, revision: session.revision, status: session.status, sessionFingerprint: session.sessionFingerprint,
      sourceExecutionPlanId: session.sourceExecutionPlanId, sourceExecutionPlanRevision: session.sourceExecutionPlanRevision,
      sourceExecutionPlanFingerprint: session.sourceExecutionPlanFingerprint,
      planSnapshotPresent: session.planSnapshot !== null,
      executionActionCount: session.execution?.actions?.length || 0,
      completedActionCount: session.completedActionIds?.length || 0,
      skippedActionCount: session.skippedActionIds?.length || 0,
      progressPercent: session.currentPosition?.progressPercent ?? null,
    } : null,
    currentVirtual: await virtualDiagnostics(currentVirtual),
    historicalVirtual: await virtualDiagnostics(historicalVirtual),
    supersededPhysicalLineages: (session?.supersededPhysicalLineages || []).map((entry) => ({
      sessionId: entry.sessionId, sessionRevision: entry.sessionRevision, sessionFingerprint: entry.sessionFingerprint,
      status: entry.status, reasonCode: entry.reasonCode, physicalProgress: entry.physicalProgress,
      virtualRunIds: entry.virtualRunIds, evidenceFingerprint: entry.evidenceFingerprint,
    })),
  };
  const result = { status: "EXACT PROJECT READONLY SNAPSHOT PASS", origin: location.origin, mode: "readonly", diagnostics, manifest };
  await postResult("exact-project-snapshot", result);
  return result;
}

function deleteDatabase(name) {
  return new Promise((resolve, reject) => {
    const request = indexedDB.deleteDatabase(name);
    request.onsuccess = resolve;
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error(`DELETE_DATABASE_BLOCKED:${name}`));
  });
}

async function createDatabase(name, schema) {
  await deleteDatabase(name);
  const request = indexedDB.open(name, schema.version);
  request.onupgradeneeded = () => {
    const database = request.result;
    for (const definition of schema.stores) {
      const store = database.createObjectStore(definition.name, { keyPath: definition.keyPath, autoIncrement: definition.autoIncrement });
      for (const index of definition.indexes) store.createIndex(index.name, index.keyPath, { unique: index.unique, multiEntry: index.multiEntry });
    }
  };
  const database = await requestResult(request);
  database.close();
}

async function createFreshDatabase(name, schema) {
  if (typeof indexedDB.databases !== "function") throw new Error("INDEXEDDB_DATABASE_ENUMERATION_UNAVAILABLE");
  const databases = await indexedDB.databases();
  if (databases.some((entry) => entry.name === name)) throw new Error(`TARGET_DATABASE_ALREADY_EXISTS:${name}`);
  const request = indexedDB.open(name, schema.version);
  request.onupgradeneeded = () => {
    const database = request.result;
    for (const definition of schema.stores) {
      const store = database.createObjectStore(definition.name, { keyPath: definition.keyPath, autoIncrement: definition.autoIncrement });
      for (const index of definition.indexes) store.createIndex(index.name, index.keyPath, { unique: index.unique, multiEntry: index.multiEntry });
    }
  };
  const database = await requestResult(request);
  database.close();
}

async function restoreRecords(name, records) {
  const database = await openExistingDatabase(name);
  try {
    const stores = Array.from(new Set(records.map((record) => record.store))).sort();
    const transaction = database.transaction(stores, "readwrite");
    for (const record of records) {
      const store = transaction.objectStore(record.store);
      const value = decodeValue(record.value);
      if (store.keyPath === null) store.add(value, decodeValue(record.key));
      else store.add(value);
    }
    await transactionComplete(transaction);
  } finally {
    database.close();
  }
}

async function verifyTarget(snapshot, recoveryPackage) {
  const manifest = await snapshotManifest(snapshot);
  assertEqual(manifest.projectCount, 17, "RESTORE_PROJECT_COUNT_MISMATCH");
  assertEqual(manifest.totalRecords, 983, "RESTORE_RECORD_COUNT_MISMATCH");
  assertEqual(manifest.projectIds, recoveryPackage.manifest.projectIds, "RESTORE_PROJECT_IDS_MISMATCH");
  assertEqual(manifest.storeCounts, recoveryPackage.manifest.storeCounts, "RESTORE_STORE_COUNTS_MISMATCH");
  assertEqual(manifest.databaseLogicalHash, recoveryPackage.manifest.targetedLogicalHash, "RESTORE_LOGICAL_HASH_MISMATCH");
  assertEqual(manifest.databaseLosslessHash, recoveryPackage.manifest.targetedLosslessHash, "RESTORE_LOSSLESS_HASH_MISMATCH");
  for (const expected of recoveryPackage.manifest.projects) {
    const actual = manifest.projects.find((project) => project.projectId === expected.projectId);
    assertEqual(actual, expected, `RESTORE_PROJECT_MANIFEST_MISMATCH:${expected.projectId}`);
  }
  assertEqual(manifest.records, recoveryPackage.manifest.records, "RESTORE_RECORD_MANIFEST_MISMATCH");
  return manifest;
}

async function verifyExactProjectTarget(snapshot, recoveryPackage) {
  const manifest = await snapshotManifest(snapshot);
  assertEqual(manifest.projectCount, recoveryPackage.manifest.projectCount, "RESTORE_PROJECT_COUNT_MISMATCH");
  assertEqual(manifest.totalRecords, recoveryPackage.manifest.recordCount, "RESTORE_RECORD_COUNT_MISMATCH");
  assertEqual(manifest.projectIds, recoveryPackage.manifest.projectIds, "RESTORE_PROJECT_IDS_MISMATCH");
  assertEqual(manifest.storeCounts, recoveryPackage.manifest.storeCounts, "RESTORE_STORE_COUNTS_MISMATCH");
  assertEqual(manifest.databaseLogicalHash, recoveryPackage.manifest.targetedLogicalHash, "RESTORE_LOGICAL_HASH_MISMATCH");
  assertEqual(manifest.databaseLosslessHash, recoveryPackage.manifest.targetedLosslessHash, "RESTORE_LOSSLESS_HASH_MISMATCH");
  assertEqual(manifest.projects, recoveryPackage.manifest.projects, "RESTORE_PROJECT_MANIFEST_MISMATCH");
  assertEqual(manifest.records, recoveryPackage.manifest.records, "RESTORE_RECORD_MANIFEST_MISMATCH");
  return manifest;
}

async function isolatedExactProjectRestore() {
  const recoveryPackage = await fetchPackage();
  assertEqual(recoveryPackage.formatVersion, EXACT_PROJECT_RECOVERY_FORMAT, "PACKAGE_FORMAT_MISMATCH");
  const hashBasis = { ...recoveryPackage };
  delete hashBasis.packageLogicalSha256;
  assertEqual(await sha256Text(canonicalJson(hashBasis)), recoveryPackage.packageLogicalSha256, "PACKAGE_HASH_MISMATCH");
  await createFreshDatabase(targetDatabaseName, recoveryPackage.source.schema);
  await restoreRecords(targetDatabaseName, recoveryPackage.records);
  const snapshot = await collectDatabase(targetDatabaseName);
  const manifest = await verifyExactProjectTarget(snapshot, recoveryPackage);
  const result = { status: "ISOLATED EXACT PROJECT RESTORE PASS", origin: location.origin, targetDatabaseName, sourceRun, packageLogicalSha256: recoveryPackage.packageLogicalSha256, manifest };
  await postResult("isolated-exact-project-restore", result);
  return result;
}

async function isolatedExactProjectVerify() {
  const recoveryPackage = await fetchPackage();
  const snapshot = await collectDatabase(targetDatabaseName);
  const manifest = await verifyExactProjectTarget(snapshot, recoveryPackage);
  const result = { status: "ISOLATED EXACT PROJECT REOPEN VERIFY PASS", origin: location.origin, targetDatabaseName, sourceRun, packageLogicalSha256: recoveryPackage.packageLogicalSha256, manifest };
  await postResult("isolated-exact-project-reopen-verify", result);
  return result;
}

async function isolatedRestore() {
  const recoveryPackage = await fetchPackage();
  assertEqual(recoveryPackage.formatVersion, FORMAT_VERSION, "PACKAGE_FORMAT_MISMATCH");
  const hashBasis = { ...recoveryPackage };
  delete hashBasis.packageLogicalSha256;
  assertEqual(await sha256Text(canonicalJson(hashBasis)), recoveryPackage.packageLogicalSha256, "PACKAGE_HASH_MISMATCH");
  await createDatabase(targetDatabaseName, recoveryPackage.source.schema);
  await restoreRecords(targetDatabaseName, recoveryPackage.records);
  const snapshot = await collectDatabase(targetDatabaseName);
  const manifest = await verifyTarget(snapshot, recoveryPackage);
  const result = { status: "ISOLATED RESTORE PASS", origin: location.origin, targetDatabaseName, sourceRun, packageLogicalSha256: recoveryPackage.packageLogicalSha256, manifest };
  await postResult("isolated-restore", result);
  return result;
}

async function isolatedVerify() {
  const recoveryPackage = await fetchPackage();
  const snapshot = await collectDatabase(targetDatabaseName);
  const manifest = await verifyTarget(snapshot, recoveryPackage);
  const result = { status: "ISOLATED REOPEN VERIFY PASS", origin: location.origin, targetDatabaseName, sourceRun, packageLogicalSha256: recoveryPackage.packageLogicalSha256, manifest };
  await postResult("isolated-reopen-verify", result);
  return result;
}

async function execute() {
  show("RUNNING", { mode, run, sourceRun, targetDatabaseName });
  try {
    const result = mode === "production-snapshot" ? await productionSnapshot()
      : mode === "fixture-export" ? await fixtureExport()
      : mode === "exact-project-export" ? await exactProjectExport()
      : mode === "exact-project-snapshot" ? await exactProjectSnapshot()
      : mode === "isolated-restore" ? await isolatedRestore()
      : mode === "isolated-verify" ? await isolatedVerify()
      : mode === "isolated-exact-project-restore" ? await isolatedExactProjectRestore()
      : mode === "isolated-exact-project-verify" ? await isolatedExactProjectVerify()
      : (() => { throw new Error(`UNKNOWN_MODE:${mode}`); })();
    show(result.status, result);
  } catch (error) {
    const result = { status: "ERROR", mode, name: error?.name, message: error?.message, stack: error?.stack };
    try { await postResult("error", result); } catch (_) {}
    show("ERROR", result);
  }
}

document.querySelector("#run").addEventListener("click", execute);
if (params.get("autorun") === "1") await execute();
