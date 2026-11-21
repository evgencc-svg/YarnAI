export const FORMAT_VERSION = "EXACT_PROJECT_HANDOFF_V1";
export const DATABASE_NAME = "yarnai-local";

const DIRECT_PROJECT_STORES = new Set([
  "projects",
  "calculations",
  "progress",
  "operations",
  "checkpoints",
  "photos",
  "pattern_files",
]);

const GLOBAL_STORES = new Set(["meta", "settings", "cache", "sync_state"]);

function bytesToBase64(bytes) {
  if (typeof Buffer !== "undefined") return Buffer.from(bytes).toString("base64");
  let binary = "";
  const chunk = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunk) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunk));
  }
  return btoa(binary);
}

function base64ToBytes(value) {
  if (typeof Buffer !== "undefined") return new Uint8Array(Buffer.from(value, "base64"));
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

function numberToken(value) {
  if (Number.isNaN(value)) return "NaN";
  if (value === Infinity) return "+Infinity";
  if (value === -Infinity) return "-Infinity";
  if (Object.is(value, -0)) return "-0";
  return null;
}

export async function encodeValue(value, stack = new WeakSet()) {
  if (value === null) return { t: "null" };
  if (value === undefined) return { t: "undefined" };
  if (typeof value === "string") return { t: "string", v: value };
  if (typeof value === "boolean") return { t: "boolean", v: value };
  if (typeof value === "number") {
    const token = numberToken(value);
    return token ? { t: "number-special", v: token } : { t: "number", v: value };
  }
  if (typeof value === "bigint") return { t: "bigint", v: value.toString(10) };
  if (typeof value === "symbol" || typeof value === "function") {
    throw new Error(`UNSUPPORTED_VALUE_TYPE:${typeof value}`);
  }
  if (stack.has(value)) throw new Error("UNSUPPORTED_CYCLIC_VALUE");
  stack.add(value);
  try {
    if (value instanceof Date) {
      return { t: "date", v: Number.isNaN(value.getTime()) ? "invalid" : value.toISOString() };
    }
    if (value instanceof RegExp) return { t: "regexp", source: value.source, flags: value.flags };
    if (typeof File !== "undefined" && value instanceof File) {
      const bytes = new Uint8Array(await value.arrayBuffer());
      return {
        t: "file",
        name: value.name,
        mime: value.type,
        lastModified: value.lastModified,
        bytes: bytesToBase64(bytes),
      };
    }
    if (value instanceof Blob) {
      const bytes = new Uint8Array(await value.arrayBuffer());
      return { t: "blob", mime: value.type, bytes: bytesToBase64(bytes) };
    }
    if (value instanceof ArrayBuffer) {
      return { t: "array-buffer", bytes: bytesToBase64(new Uint8Array(value)) };
    }
    if (ArrayBuffer.isView(value)) {
      return {
        t: value instanceof DataView ? "data-view" : "typed-array",
        ctor: value.constructor.name,
        bytes: bytesToBase64(new Uint8Array(value.buffer, value.byteOffset, value.byteLength)),
      };
    }
    if (Array.isArray(value)) {
      const items = [];
      for (const item of value) items.push(await encodeValue(item, stack));
      return { t: "array", items };
    }
    if (value instanceof Map) {
      const entries = [];
      for (const [key, entryValue] of value.entries()) {
        entries.push([await encodeValue(key, stack), await encodeValue(entryValue, stack)]);
      }
      return { t: "map", entries };
    }
    if (value instanceof Set) {
      const items = [];
      for (const item of value.values()) items.push(await encodeValue(item, stack));
      return { t: "set", items };
    }
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
      throw new Error(`UNSUPPORTED_OBJECT_PROTOTYPE:${prototype?.constructor?.name ?? "null"}`);
    }
    const entries = [];
    for (const key of Object.keys(value)) entries.push([key, await encodeValue(value[key], stack)]);
    return { t: "object", nullPrototype: prototype === null, entries };
  } finally {
    stack.delete(value);
  }
}

export function decodeValue(node) {
  switch (node?.t) {
    case "null": return null;
    case "undefined": return undefined;
    case "string":
    case "boolean":
    case "number": return node.v;
    case "number-special":
      if (node.v === "NaN") return NaN;
      if (node.v === "+Infinity") return Infinity;
      if (node.v === "-Infinity") return -Infinity;
      if (node.v === "-0") return -0;
      throw new Error(`INVALID_NUMBER_TOKEN:${node.v}`);
    case "bigint": return BigInt(node.v);
    case "date": return new Date(node.v === "invalid" ? NaN : node.v);
    case "regexp": return new RegExp(node.source, node.flags);
    case "file": {
      const bytes = base64ToBytes(node.bytes);
      if (typeof File === "undefined") throw new Error("FILE_CONSTRUCTOR_UNAVAILABLE");
      return new File([bytes], node.name, { type: node.mime, lastModified: node.lastModified });
    }
    case "blob": return new Blob([base64ToBytes(node.bytes)], { type: node.mime });
    case "array-buffer": return base64ToBytes(node.bytes).buffer;
    case "data-view": {
      const bytes = base64ToBytes(node.bytes);
      return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    }
    case "typed-array": {
      const bytes = base64ToBytes(node.bytes);
      const constructors = {
        Int8Array, Uint8Array, Uint8ClampedArray, Int16Array, Uint16Array,
        Int32Array, Uint32Array, Float32Array, Float64Array, BigInt64Array, BigUint64Array,
      };
      const Constructor = constructors[node.ctor];
      if (!Constructor) throw new Error(`UNSUPPORTED_TYPED_ARRAY:${node.ctor}`);
      const copy = bytes.slice().buffer;
      return new Constructor(copy);
    }
    case "array": return node.items.map(decodeValue);
    case "map": return new Map(node.entries.map(([key, value]) => [decodeValue(key), decodeValue(value)]));
    case "set": return new Set(node.items.map(decodeValue));
    case "object": {
      const value = node.nullPrototype ? Object.create(null) : {};
      for (const [key, entryValue] of node.entries) value[key] = decodeValue(entryValue);
      return value;
    }
    default: throw new Error(`UNSUPPORTED_TRANSPORT_TAG:${node?.t}`);
  }
}

function normalizeEncoded(node) {
  if (!node || typeof node !== "object") return node;
  if (Array.isArray(node)) return node.map(normalizeEncoded);
  if (node.t === "object") {
    return {
      ...node,
      entries: node.entries
        .map(([key, value]) => [key, normalizeEncoded(value)])
        .sort(([left], [right]) => left.localeCompare(right)),
    };
  }
  const result = {};
  for (const key of Object.keys(node).sort()) result[key] = normalizeEncoded(node[key]);
  return result;
}

export function canonicalJson(value) {
  function normalize(valueToNormalize) {
    if (Array.isArray(valueToNormalize)) return valueToNormalize.map(normalize);
    if (!valueToNormalize || typeof valueToNormalize !== "object") return valueToNormalize;
    const result = {};
    for (const key of Object.keys(valueToNormalize).sort()) result[key] = normalize(valueToNormalize[key]);
    return result;
  }
  return JSON.stringify(normalize(value));
}

export async function sha256Text(value) {
  const bytes = new TextEncoder().encode(value);
  return sha256Bytes(bytes);
}

export async function sha256Bytes(bytes) {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function sha256Base64(value) {
  return sha256Bytes(base64ToBytes(value));
}

export async function hashRecords(records) {
  const normalized = records
    .map((record) => ({ store: record.store, key: normalizeEncoded(record.key), value: normalizeEncoded(record.value) }))
    .sort((left, right) => left.store.localeCompare(right.store) || canonicalJson(left.key).localeCompare(canonicalJson(right.key)));
  return sha256Text(canonicalJson(normalized));
}

function directObject(node) {
  if (node?.t !== "object") return null;
  return Object.fromEntries(node.entries);
}

function scalar(node) {
  if (["string", "boolean", "number", "bigint"].includes(node?.t)) return node.v;
  return undefined;
}

function objectField(node, name) {
  const object = directObject(node);
  return object ? scalar(object[name]) : undefined;
}

function collectIdentityStrings(node, keyHint = "", output = new Set()) {
  if (!node || typeof node !== "object") return output;
  if (node.t === "string" && (/(?:_id|Id|identity|fingerprint|checksum)$/i.test(keyHint) || /^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(node.v))) {
    output.add(node.v);
  } else if (node.t === "object") {
    for (const [key, value] of node.entries) collectIdentityStrings(value, key, output);
  } else if (node.t === "array" || node.t === "set") {
    for (const value of node.items) collectIdentityStrings(value, keyHint, output);
  } else if (node.t === "map") {
    for (const [key, value] of node.entries) {
      collectIdentityStrings(key, keyHint, output);
      collectIdentityStrings(value, keyHint, output);
    }
  }
  return output;
}

function collectPrimaryKeyStrings(node, output = new Set()) {
  if (!node || typeof node !== "object") return output;
  if (node.t === "string") output.add(node.v);
  else if (node.t === "array") {
    for (const value of node.items) collectPrimaryKeyStrings(value, output);
  }
  return output;
}

export function encodedContainsString(node, candidates) {
  if (!node || typeof node !== "object") return false;
  if (node.t === "string") return candidates.has(node.v);
  if (node.t === "object" || node.t === "map") return node.entries.some(([key, value]) => encodedContainsString(key, candidates) || encodedContainsString(value, candidates));
  if (node.t === "array" || node.t === "set") return node.items.some((value) => encodedContainsString(value, candidates));
  return false;
}

export function buildProjectClosure(allRecords, projectId) {
  const selected = [];
  const selectedTokens = new Set();
  const selectedMarker = new Set();
  const add = (record) => {
    const marker = `${record.store}:${canonicalJson(record.key)}`;
    if (selectedMarker.has(marker)) return false;
    selectedMarker.add(marker);
    selected.push(record);
    for (const token of collectPrimaryKeyStrings(record.key)) selectedTokens.add(token);
    return true;
  };

  for (const record of allRecords) {
    if (DIRECT_PROJECT_STORES.has(record.store) && objectField(record.value, "project_id") === projectId) add(record);
  }
  selectedTokens.add(projectId);

  let changed = true;
  while (changed) {
    changed = false;
    const photoIds = new Set(selected.filter((record) => record.store === "photos").map((record) => objectField(record.value, "photo_id")));
    const patternFileIds = new Set(selected.filter((record) => record.store === "pattern_files").map((record) => objectField(record.value, "pattern_file_id")));
    for (const record of allRecords) {
      const marker = `${record.store}:${canonicalJson(record.key)}`;
      if (selectedMarker.has(marker)) continue;
      if (record.store === "photo_blobs" && photoIds.has(objectField(record.value, "photo_id"))) changed = add(record) || changed;
      else if (record.store === "pattern_file_blobs" && patternFileIds.has(objectField(record.value, "pattern_file_id"))) changed = add(record) || changed;
      else if (["transfer_receipts", "quarantine", "migration_records"].includes(record.store) && encodedContainsString(record.value, selectedTokens)) changed = add(record) || changed;
    }
  }

  const projectRecords = selected.filter((record) => record.store === "projects");
  const databaseLevelReferences = [];
  const unknownReferences = [];
  for (const record of allRecords) {
    const marker = `${record.store}:${canonicalJson(record.key)}`;
    if (selectedMarker.has(marker) || !encodedContainsString(record.value, selectedTokens)) continue;
    const summary = { store: record.store, key: record.key };
    if (GLOBAL_STORES.has(record.store)) databaseLevelReferences.push(summary);
    else unknownReferences.push(summary);
  }
  return {
    records: selected,
    projectRecordCount: projectRecords.length,
    identifiers: Array.from(selectedTokens).sort(),
    databaseLevelReferences,
    unknownReferences,
  };
}

export function collectTypeTags(node, output = new Set()) {
  if (!node || typeof node !== "object") return output;
  if (typeof node.t === "string") output.add(node.t);
  if (node.t === "object" || node.t === "map") {
    for (const [key, value] of node.entries) {
      collectTypeTags(key, output);
      collectTypeTags(value, output);
    }
  } else if (node.t === "array" || node.t === "set") {
    for (const value of node.items) collectTypeTags(value, output);
  }
  return output;
}

export function summarizeRecord(record) {
  const value = directObject(record.value) ?? {};
  const fingerprints = [];
  const walk = (node, path = "") => {
    if (!node || typeof node !== "object") return;
    if (node.t === "object") {
      for (const [key, child] of node.entries) {
        const nextPath = path ? `${path}.${key}` : key;
        if (/fingerprint|checksum/i.test(key) && child.t === "string") fingerprints.push({ path: nextPath, value: child.v });
        walk(child, nextPath);
      }
    } else if (node.t === "array" || node.t === "set") node.items.forEach((child, index) => walk(child, `${path}[${index}]`));
    else if (node.t === "map") node.entries.forEach(([key, child], index) => { walk(key, `${path}.mapKey[${index}]`); walk(child, `${path}.mapValue[${index}]`); });
  };
  walk(record.value);
  return {
    store: record.store,
    key: record.key,
    revision: scalar(value.revision) ?? null,
    fingerprints,
  };
}

export function schemaSignature(schema) {
  return canonicalJson({
    name: schema.name,
    version: schema.version,
    stores: schema.stores.map((store) => ({
      name: store.name,
      keyPath: store.keyPath,
      autoIncrement: store.autoIncrement,
      indexes: store.indexes,
    })).sort((left, right) => left.name.localeCompare(right.name)),
  });
}
