import assert from "node:assert/strict";
import test from "node:test";
import { buildProjectClosure, decodeValue, encodeValue, hashRecords } from "./core.mjs";

test("lossless codec round-trips supported structured-clone values", async () => {
  const source = {
    text: "Flax",
    bigint: 9007199254740993n,
    negativeZero: -0,
    date: new Date("2026-08-30T10:00:00.000Z"),
    map: new Map([["a", 1]]),
    set: new Set(["x", "y"]),
    bytes: new Uint16Array([1, 65535]),
    buffer: new Uint8Array([4, 5, 6]).buffer,
    blob: new Blob([new Uint8Array([1, 2, 3])], { type: "application/pdf" }),
    missing: undefined,
  };
  const encoded = await encodeValue(source);
  const decoded = decodeValue(encoded);
  assert.equal(decoded.text, source.text);
  assert.equal(decoded.bigint, source.bigint);
  assert.ok(Object.is(decoded.negativeZero, -0));
  assert.equal(decoded.date.toISOString(), source.date.toISOString());
  assert.deepEqual(Array.from(decoded.map), Array.from(source.map));
  assert.deepEqual(Array.from(decoded.set), Array.from(source.set));
  assert.deepEqual(Array.from(decoded.bytes), Array.from(source.bytes));
  assert.deepEqual(Array.from(new Uint8Array(decoded.buffer)), [4, 5, 6]);
  assert.equal(decoded.blob.type, "application/pdf");
  assert.deepEqual(Array.from(new Uint8Array(await decoded.blob.arrayBuffer())), [1, 2, 3]);
  assert.ok(Object.hasOwn(decoded, "missing"));
});

test("project closure includes direct records and binary dependencies but excludes settings", async () => {
  const projectId = "01a04c4a-769d-7cc8-9d3a-bc8fcbbda06b";
  const values = [
    ["projects", projectId, { project_id: projectId }],
    ["pattern_files", "file-1", { pattern_file_id: "file-1", project_id: projectId }],
    ["pattern_file_blobs", "blob-1", { blob_id: "blob-1", pattern_file_id: "file-1", blob: new Blob(["pdf"]) }],
    ["settings", "last", { setting_id: "last", last_opened_project_id: projectId }],
  ];
  const records = [];
  for (const [store, key, value] of values) records.push({ store, key: await encodeValue(key), value: await encodeValue(value) });
  const closure = buildProjectClosure(records, projectId);
  assert.deepEqual(closure.records.map((record) => record.store).sort(), ["pattern_file_blobs", "pattern_files", "projects"]);
  assert.equal(closure.databaseLevelReferences.length, 1);
  assert.equal(closure.unknownReferences.length, 0);
});

test("project closure follows owned primary keys without treating shared metadata as ownership", async () => {
  const projectId = "01a04c4a-769d-7cc8-9d3a-bc8fcbbda06b";
  const otherProjectId = "01a04c4b-769d-7cc8-9d3a-bc8fcbbda06b";
  const sharedDeviceId = "device-shared-by-all-projects";
  const values = [
    ["projects", projectId, { project_id: projectId, device_id: sharedDeviceId }],
    ["operations", "operation-owned-by-flax", { operation_id: "operation-owned-by-flax", project_id: projectId, device_id: sharedDeviceId }],
    ["transfer_receipts", "receipt-for-flax-operation", { transfer_id: "receipt-for-flax-operation", operation_id: "operation-owned-by-flax" }],
    ["projects", otherProjectId, { project_id: otherProjectId, device_id: sharedDeviceId }],
  ];
  const records = [];
  for (const [store, key, value] of values) records.push({ store, key: await encodeValue(key), value: await encodeValue(value) });
  const closure = buildProjectClosure(records, projectId);
  assert.deepEqual(closure.records.map((record) => record.store).sort(), ["operations", "projects", "transfer_receipts"]);
  assert.equal(closure.projectRecordCount, 1);
  assert.equal(closure.unknownReferences.length, 0);
});

test("logical hash ignores plain-object insertion order and preserves array order", async () => {
  const left = [{ store: "projects", key: await encodeValue("p"), value: await encodeValue({ a: 1, b: [1, 2] }) }];
  const right = [{ store: "projects", key: await encodeValue("p"), value: await encodeValue({ b: [1, 2], a: 1 }) }];
  const changed = [{ store: "projects", key: await encodeValue("p"), value: await encodeValue({ a: 1, b: [2, 1] }) }];
  assert.equal(await hashRecords(left), await hashRecords(right));
  assert.notEqual(await hashRecords(left), await hashRecords(changed));
});
