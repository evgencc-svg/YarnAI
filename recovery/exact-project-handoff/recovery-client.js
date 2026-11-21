import {
  DATABASE_NAME,
  FORMAT_VERSION,
  buildProjectClosure,
  canonicalJson,
  collectTypeTags,
  decodeValue,
  encodeValue,
  hashRecords,
  schemaSignature,
  sha256Base64,
  sha256Text,
  summarizeRecord,
} from "./core.mjs";

const output = document.querySelector("#output");
const heading = document.querySelector("#status");
const params = new URLSearchParams(location.search);
const mode = params.get("mode") || "inventory";
const run = params.get("run") || `run-${Date.now()}`;
const projectId = params.get("projectId") || "";
const ORIGIN_BACKUP_FORMAT = "EXACT_YARNAI_ORIGIN_BACKUP_V1";

function show(status, details) {
  heading.textContent = status;
  output.textContent = typeof details === "string" ? details : JSON.stringify(details, null, 2);
  document.title = `${status} — Exact YarnAI project handoff`;
}

function requestResult(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function transactionComplete(transaction) {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onabort = () => reject(transaction.error || new Error("TRANSACTION_ABORTED"));
    transaction.onerror = () => {};
  });
}

async function openExistingDatabase() {
  if (typeof indexedDB.databases !== "function") throw new Error("INDEXEDDB_DATABASE_ENUMERATION_UNAVAILABLE");
  const databases = await indexedDB.databases();
  if (!databases.some((entry) => entry.name === DATABASE_NAME)) throw new Error("DATABASE_NOT_FOUND");
  const request = indexedDB.open(DATABASE_NAME);
  request.onupgradeneeded = () => {
    request.transaction.abort();
  };
  return requestResult(request);
}

async function collectDatabase() {
  const database = await openExistingDatabase();
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
          if (!cursor) {
            resolve();
            return;
          }
          rawRecords.push({ store: storeName, key: cursor.primaryKey, value: cursor.value });
          cursor.continue();
        };
      });
    }
    await transactionComplete(transaction);
    const records = [];
    for (const record of rawRecords) {
      records.push({ store: record.store, key: await encodeValue(record.key), value: await encodeValue(record.value) });
    }
    schema.stores.sort((left, right) => left.name.localeCompare(right.name));
    return { schema, records };
  } finally {
    database.close();
  }
}

function storeCounts(records) {
  const counts = {};
  for (const record of records) counts[record.store] = (counts[record.store] || 0) + 1;
  return Object.fromEntries(Object.entries(counts).sort(([left], [right]) => left.localeCompare(right)));
}

function completeStoreCounts(snapshot) {
  const counts = Object.fromEntries(snapshot.schema.stores.map((store) => [store.name, 0]));
  for (const record of snapshot.records) counts[record.store] += 1;
  return Object.fromEntries(Object.entries(counts).sort(([left], [right]) => left.localeCompare(right)));
}

function requireProjectId() {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(projectId)) {
    throw new Error("VALID_PROJECT_ID_REQUIRED");
  }
}

function encodedObject(node) {
  return node?.t === "object" ? Object.fromEntries(node.entries) : {};
}

function encodedScalar(node) {
  return ["string", "number", "boolean", "bigint"].includes(node?.t) ? node.v : null;
}

function projectIdentity(record) {
  const value = encodedObject(record.value);
  return {
    project_id: encodedScalar(value.project_id),
    name: encodedScalar(value.title) ?? encodedScalar(value.name),
    revision: encodedScalar(value.revision),
    current_stage: encodedScalar(value.current_stage),
  };
}

function blobDetails(records) {
  const details = [];
  for (const record of records.filter((entry) => ["pattern_file_blobs", "photo_blobs"].includes(entry.store))) {
    const value = encodedObject(record.value);
    const blob = value.blob;
    if (!blob || !["blob", "file"].includes(blob.t)) continue;
    details.push({
      store: record.store,
      key: record.key,
      kind: blob.t,
      mime: blob.mime,
      filename: blob.name || null,
      lastModified: blob.lastModified ?? null,
      byteLength: Math.floor((blob.bytes.length * 3) / 4) - (blob.bytes.endsWith("==") ? 2 : blob.bytes.endsWith("=") ? 1 : 0),
      sha256: null,
      encodedBytes: blob.bytes,
    });
  }
  return details;
}

async function finalizeBlobDetails(details) {
  for (const detail of details) {
    detail.sha256 = await sha256Base64(detail.encodedBytes);
    delete detail.encodedBytes;
  }
  return details;
}

async function manifestForProject(databaseSnapshot, id) {
  const closure = buildProjectClosure(databaseSnapshot.records, id);
  const aggregateHash = await hashRecords(closure.records);
  const tags = new Set();
  for (const record of closure.records) {
    collectTypeTags(record.key, tags);
    collectTypeTags(record.value, tags);
  }
  const blobs = await finalizeBlobDetails(blobDetails(closure.records));
  return {
    projectId: id,
    projectRecordCount: closure.projectRecordCount,
    aggregateLogicalHash: aggregateHash,
    recordCount: closure.records.length,
    storeCounts: storeCounts(closure.records),
    records: closure.records.map(summarizeRecord),
    blobCount: blobs.length,
    blobBytes: blobs.reduce((sum, entry) => sum + entry.byteLength, 0),
    blobs,
    typeTags: Array.from(tags).sort(),
    dependencyIds: closure.identifiers,
    databaseLevelReferences: closure.databaseLevelReferences,
    unknownReferences: closure.unknownReferences,
  };
}

async function inventory(snapshot) {
  const projectRecords = snapshot.records.filter((record) => record.store === "projects");
  const projects = [];
  for (const record of projectRecords) {
    const identity = projectIdentity(record);
    const manifest = await manifestForProject(snapshot, identity.project_id);
    projects.push({ ...identity, ...manifest });
  }
  projects.sort((left, right) => left.project_id.localeCompare(right.project_id));
  return {
    database: snapshot.schema.name,
    version: snapshot.schema.version,
    schema: snapshot.schema,
    schemaSignature: schemaSignature(snapshot.schema),
    storeCounts: completeStoreCounts(snapshot),
    totalRecords: snapshot.records.length,
    projectCount: projects.length,
    projectIds: projects.map((project) => project.project_id),
    projects,
  };
}

async function utilityInfo() {
  const response = await fetch("/api/utility-info", { cache: "no-store" });
  if (!response.ok) throw new Error(`UTILITY_INFO_HTTP_${response.status}`);
  return response.json();
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

async function fetchResult(sourceRun, kind) {
  const response = await fetch(`/api/result?run=${encodeURIComponent(sourceRun)}&kind=${encodeURIComponent(kind)}`, { cache: "no-store" });
  if (!response.ok) throw new Error(`RESULT_HTTP_${response.status}:${sourceRun}:${kind}`);
  return response.json();
}

async function buildOriginBackup(snapshot) {
  const info = await utilityInfo();
  return {
    formatVersion: ORIGIN_BACKUP_FORMAT,
    createdAt: new Date().toISOString(),
    origin: location.origin,
    utilityVersion: info.version,
    utilitySha256: info.sha256,
    database: snapshot.schema.name,
    version: snapshot.schema.version,
    schema: snapshot.schema,
    schemaSignature: schemaSignature(snapshot.schema),
    totalRecords: snapshot.records.length,
    storeCounts: completeStoreCounts(snapshot),
    recordsHash: await hashRecords(snapshot.records),
    records: snapshot.records,
  };
}

async function validateOriginBackup(envelope, currentSnapshot = null) {
  const errors = [];
  if (envelope?.formatVersion !== ORIGIN_BACKUP_FORMAT) errors.push("BACKUP_FORMAT_MISMATCH");
  if (!Array.isArray(envelope?.records)) errors.push("BACKUP_RECORDS_MISSING");
  if (!envelope?.schema || envelope.schemaSignature !== schemaSignature(envelope.schema)) errors.push("BACKUP_SCHEMA_SIGNATURE_MISMATCH");
  if (errors.length) return { valid: false, errors };
  for (const record of envelope.records) {
    if (typeof record?.store !== "string") errors.push("BACKUP_RECORD_STORE_INVALID");
    decodeValue(record.key);
    decodeValue(record.value);
  }
  const recordsHash = await hashRecords(envelope.records);
  if (recordsHash !== envelope.recordsHash) errors.push("BACKUP_RECORDS_HASH_MISMATCH");
  if (envelope.records.length !== envelope.totalRecords) errors.push("BACKUP_RECORD_COUNT_MISMATCH");
  const backupCounts = {};
  for (const store of envelope.schema.stores) backupCounts[store.name] = 0;
  for (const record of envelope.records) backupCounts[record.store] = (backupCounts[record.store] || 0) + 1;
  if (canonicalJson(backupCounts) !== canonicalJson(envelope.storeCounts)) errors.push("BACKUP_STORE_COUNTS_MISMATCH");
  let currentRecordsHash = null;
  if (currentSnapshot) {
    currentRecordsHash = await hashRecords(currentSnapshot.records);
    if (schemaSignature(currentSnapshot.schema) !== envelope.schemaSignature) errors.push("CURRENT_SCHEMA_MISMATCH");
    if (currentRecordsHash !== envelope.recordsHash) errors.push("CURRENT_DATABASE_CHANGED_SINCE_BACKUP");
    if (canonicalJson(completeStoreCounts(currentSnapshot)) !== canonicalJson(envelope.storeCounts)) errors.push("CURRENT_STORE_COUNTS_MISMATCH");
  }
  return { valid: errors.length === 0, errors, recordsHash, currentRecordsHash };
}

async function backupOrigin(snapshot) {
  const envelope = await buildOriginBackup(snapshot);
  const saved = await postResult("backup", envelope);
  return {
    status: "ORIGIN BACKUP PASS",
    origin: envelope.origin,
    database: envelope.database,
    version: envelope.version,
    totalRecords: envelope.totalRecords,
    storeCounts: envelope.storeCounts,
    recordsHash: envelope.recordsHash,
    saved,
  };
}

async function verifyOriginBackup(snapshot) {
  const backupRun = params.get("backupRun");
  if (!backupRun) throw new Error("BACKUP_RUN_REQUIRED");
  const envelope = await fetchResult(backupRun, "backup");
  const validation = await validateOriginBackup(envelope, snapshot);
  const result = {
    status: validation.valid ? "ORIGIN BACKUP VERIFY PASS" : "BLOCKED — ORIGIN BACKUP VERIFY FAILED",
    backupRun,
    origin: envelope.origin,
    totalRecords: envelope.totalRecords,
    storeCounts: envelope.storeCounts,
    recordsHash: envelope.recordsHash,
    validation,
  };
  await postResult("backup-verification", result);
  return result;
}

async function exportProject(snapshot) {
  requireProjectId();
  const info = await utilityInfo();
  const manifest = await manifestForProject(snapshot, projectId);
  if (manifest.projectRecordCount !== 1 || manifest.unknownReferences.length) {
    const error = { status: "BLOCKED — SOURCE DEPENDENCY CLOSURE NOT PROVEN", manifest };
    await postResult("blocked", error);
    return error;
  }
  const closure = buildProjectClosure(snapshot.records, projectId);
  const transport = {
    formatVersion: FORMAT_VERSION,
    createdAt: new Date().toISOString(),
    utilityVersion: info.version,
    utilitySha256: info.sha256,
    source: { database: snapshot.schema.name, version: snapshot.schema.version, schema: snapshot.schema },
    projectId,
    manifest,
    records: closure.records,
  };
  transport.transportSha256 = await sha256Text(canonicalJson({ ...transport, transportSha256: undefined }));
  await postResult("transport", transport);
  return { status: "SOURCE EXPORT PASS", manifest, transportSha256: transport.transportSha256 };
}

async function fetchTransport(sourceRun) {
  const response = await fetch(`/api/transport?run=${encodeURIComponent(sourceRun)}`, { cache: "no-store" });
  if (!response.ok) throw new Error(`TRANSPORT_HTTP_${response.status}`);
  return response.json();
}

async function collisionCheck(snapshot, transport) {
  const collisions = [];
  if (transport.formatVersion !== FORMAT_VERSION) collisions.push({ code: "FORMAT_VERSION_MISMATCH" });
  if (schemaSignature(snapshot.schema) !== schemaSignature(transport.source.schema)) collisions.push({ code: "SCHEMA_MISMATCH" });
  const database = await openExistingDatabase();
  try {
    for (const record of transport.records) {
      if (!database.objectStoreNames.contains(record.store)) {
        collisions.push({ code: "STORE_MISSING", store: record.store });
        continue;
      }
      const transaction = database.transaction(record.store, "readonly");
      const existing = await requestResult(transaction.objectStore(record.store).get(decodeValue(record.key)));
      await transactionComplete(transaction);
      if (existing !== undefined) collisions.push({ code: "PRIMARY_KEY_COLLISION", store: record.store, key: record.key });
    }
  } finally {
    database.close();
  }
  const sourceIds = new Set(transport.manifest.dependencyIds);
  for (const targetRecord of snapshot.records) {
    const serialized = canonicalJson(targetRecord.value);
    for (const id of sourceIds) {
      if (serialized.includes(JSON.stringify(id).slice(1, -1))) {
        collisions.push({ code: "LINKED_ID_COLLISION", store: targetRecord.store, key: targetRecord.key, id });
        break;
      }
    }
  }
  const sourcePdfHashes = new Set(transport.manifest.blobs.filter((entry) => entry.store === "pattern_file_blobs").map((entry) => entry.sha256));
  for (const detail of await finalizeBlobDetails(blobDetails(snapshot.records))) {
    if (sourcePdfHashes.has(detail.sha256)) collisions.push({ code: "PDF_HASH_OWNER_COLLISION", store: detail.store, key: detail.key, sha256: detail.sha256 });
  }
  return collisions;
}

async function dryRunImport(snapshot) {
  requireProjectId();
  const sourceRun = params.get("sourceRun");
  const targetBackupRun = params.get("targetBackupRun");
  if (!sourceRun || !targetBackupRun) throw new Error("SOURCE_AND_TARGET_BACKUP_RUN_REQUIRED");
  const transport = await fetchTransport(sourceRun);
  if (transport.projectId !== projectId) throw new Error("TRANSPORT_PROJECT_ID_MISMATCH");
  const targetBackup = await fetchResult(targetBackupRun, "backup");
  const targetBackupValidation = await validateOriginBackup(targetBackup, snapshot);
  const before = await inventory(snapshot);
  const collisions = targetBackupValidation.valid ? await collisionCheck(snapshot, transport) : [];
  const recordsToAdd = storeCounts(transport.records);
  const projectedStoreCounts = { ...before.storeCounts };
  for (const [store, count] of Object.entries(recordsToAdd)) projectedStoreCounts[store] = (projectedStoreCounts[store] || 0) + count;
  const pass = targetBackupValidation.valid && collisions.length === 0 && transport.manifest.projectRecordCount === 1 && transport.manifest.unknownReferences.length === 0;
  const result = {
    status: pass ? "DRY RUN PASS — NO WRITES" : "BLOCKED — DRY RUN FAILED",
    sourceRun,
    targetBackupRun,
    projectId,
    targetDatabaseHash: await hashRecords(snapshot.records),
    targetBackupValidation,
    collisions,
    recordsToAdd,
    projectedStoreCounts,
    before,
    sourceManifest: transport.manifest,
    sourceTransportSha256: transport.transportSha256,
  };
  await postResult("dry-run", result);
  return result;
}

async function atomicAdd(transport) {
  const database = await openExistingDatabase();
  const stores = Array.from(new Set(transport.records.map((record) => record.store))).sort();
  try {
    const transaction = database.transaction(stores, "readwrite");
    for (const record of transport.records) {
      const store = transaction.objectStore(record.store);
      const value = decodeValue(record.value);
      if (store.keyPath === null) store.add(value, decodeValue(record.key));
      else store.add(value);
    }
    await transactionComplete(transaction);
    return stores;
  } catch (error) {
    throw new Error(`ATOMIC_IMPORT_ABORTED:${error?.name || "Error"}:${error?.message || error}`);
  } finally {
    database.close();
  }
}

async function importProject(snapshot) {
  requireProjectId();
  const sourceRun = params.get("sourceRun");
  const dryRun = params.get("dryRun");
  if (!sourceRun || !dryRun) throw new Error("SOURCE_AND_DRY_RUN_REQUIRED");
  const transport = await fetchTransport(sourceRun);
  if (transport.projectId !== projectId) throw new Error("TRANSPORT_PROJECT_ID_MISMATCH");
  const approvedDryRun = await fetchResult(dryRun, "dry-run");
  if (approvedDryRun.status !== "DRY RUN PASS — NO WRITES" || approvedDryRun.projectId !== projectId || approvedDryRun.sourceTransportSha256 !== transport.transportSha256) {
    throw new Error("DRY_RUN_BINDING_INVALID");
  }
  const before = await inventory(snapshot);
  const currentDatabaseHash = await hashRecords(snapshot.records);
  if (currentDatabaseHash !== approvedDryRun.targetDatabaseHash) {
    const result = { status: "BLOCKED — TARGET CHANGED AFTER DRY RUN", before, approvedDryRun, currentDatabaseHash };
    await postResult("import", result);
    return result;
  }
  const collisions = await collisionCheck(snapshot, transport);
  if (collisions.length) {
    const result = { status: "BLOCKED — IMPORT COLLISION", collisions, before };
    await postResult("import", result);
    return result;
  }
  const stores = await atomicAdd(transport);
  const afterSnapshot = await collectDatabase();
  const after = await inventory(afterSnapshot);
  const originalUnchanged = before.projects.every((project) => after.projects.some((candidate) => candidate.project_id === project.project_id && candidate.aggregateLogicalHash === project.aggregateLogicalHash));
  const flax = after.projects.find((project) => project.project_id === transport.projectId);
  const exact = Boolean(flax && flax.aggregateLogicalHash === transport.manifest.aggregateLogicalHash);
  const status = after.projectCount === before.projectCount + 1 && originalUnchanged && exact
    ? "ATOMIC IMPORT PASS"
    : "FAIL — ATOMIC IMPORT NOT EXACT";
  const result = { status, transactionStores: stores, collisionResult: "PASS", before, after, originalUnchanged, flaxExact: exact, sourceManifest: transport.manifest };
  await postResult("import", result);
  return result;
}

async function verifyDatabase(snapshot) {
  const baselineRun = params.get("baselineRun") || "rehearsal";
  const response = await fetch(`/api/result?run=${encodeURIComponent(baselineRun)}&kind=import`, { cache: "no-store" });
  if (!response.ok) throw new Error(`BASELINE_RESULT_HTTP_${response.status}`);
  const baseline = await response.json();
  const current = await inventory(snapshot);
  const hashesMatch = baseline.after.projects.every((project) => current.projects.some((candidate) => candidate.project_id === project.project_id && candidate.aggregateLogicalHash === project.aggregateLogicalHash));
  const status = hashesMatch && current.projectCount === baseline.after.projectCount ? "VERIFY PASS" : "FAIL — REHEARSAL IMPORT NOT EXACT";
  const result = { status, phase: params.get("phase") || "verify", projectCount: current.projectCount, hashesMatch, current };
  await postResult(params.get("phase") || "verify", result);
  return result;
}

async function runMode() {
  show("RUNNING", { mode, run, projectId });
  const snapshot = await collectDatabase();
  if (mode === "inventory") {
    const result = await inventory(snapshot);
    await postResult("inventory", result);
    return { status: "INVENTORY PASS", ...result };
  }
  if (mode === "backup") return backupOrigin(snapshot);
  if (mode === "verify-backup") return verifyOriginBackup(snapshot);
  if (mode === "export") return exportProject(snapshot);
  if (mode === "dry-run") return dryRunImport(snapshot);
  if (mode === "import") return importProject(snapshot);
  if (mode === "verify") return verifyDatabase(snapshot);
  throw new Error(`UNKNOWN_MODE:${mode}`);
}

async function execute() {
  try {
    const result = await runMode();
    show(result.status, result);
  } catch (error) {
    const result = { status: "ERROR", name: error?.name, message: error?.message, stack: error?.stack };
    try { await postResult("error", result); } catch (_) {}
    show("ERROR", result);
  }
}

document.querySelector("#run").addEventListener("click", execute);

if (params.get("autorun") === "1") await execute();
