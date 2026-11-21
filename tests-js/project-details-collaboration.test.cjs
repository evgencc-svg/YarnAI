"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { webcrypto } = require("node:crypto");
require("fake-indexeddb/auto");
if (!globalThis.crypto) Object.defineProperty(globalThis, "crypto", { value: webcrypto });

const detailsApi = require("../src/yarnai/static/project-details-experience.js");
const api = require("../src/yarnai/static/project-details-collaboration.js");
require("../src/yarnai/static/project-system.js");

const PROJECT_ID = "01890f42-8a7b-7c6d-8e9f-0123456789ab";
const REQUEST_ID = "01890f42-8a7b-7c6d-8e9f-0123456789ac";
const RESPONSE_ID = "01890f42-8a7b-7c6d-8e9f-0123456789ad";
const CREATED = "2026-08-02T10:00:00.000Z";
const LATER = "2026-08-02T11:00:00.000Z";
const EXPIRES = "2026-09-01T10:00:00.000Z";

function details() {
  return {
    version: 1,
    sizeMode: "custom",
    standardSize: "M",
    recipient: "woman",
    fit: "regular",
    bodyMeasurements: {
      bust: { value: 90, unit: "cm", provenance: "user" },
      waist: { value: 72, unit: "cm", provenance: "project_description" },
    },
    garmentMeasurements: {
      garmentLength: { value: 60, unit: "cm", provenance: "user" },
      sleeveLength: { value: 56, unit: "cm", provenance: "user" },
    },
    provenance: { sizeMode: "user", standardSize: "user", recipient: "user", fit: "user" },
  };
}

function request(groups = ["recipient_information", "body_measurements"]) {
  return api.buildCollaborationRequest({
    projectId: PROJECT_ID,
    projectTitle: "Свитер",
    projectRevision: 7,
    ownerLabel: "Анна",
    helperLabel: "Наталья",
    instruction: "Проверь мерки",
    groups,
    details: details(),
    garmentType: "sweater",
    intent: { garmentType: "sweater" },
  }, { requestId: REQUEST_ID, createdAt: CREATED, expiresAt: EXPIRES });
}

function response(source = request(), proposals = [{ path: "details.bodyMeasurements.bust", value: 94, explanation: "Измерено повторно" }]) {
  return api.buildCollaborationResponse(source, proposals, {
    responseId: RESPONSE_ID,
    createdAt: LATER,
    expiresAt: EXPIRES,
    now: LATER,
  });
}

function resignRequest(value) {
  const next = structuredClone(value);
  const snapshotInput = structuredClone(next.snapshot);
  delete snapshotInput.fingerprint;
  next.snapshot.fingerprint = api.fingerprint(snapshotInput);
  next.sourceIdentity = api.fingerprint({ projectId: next.projectId, projectRevision: next.snapshot.projectRevision, snapshotFingerprint: next.snapshot.fingerprint });
  delete next.fingerprint;
  next.fingerprint = api.fingerprint(next);
  return next;
}

function resignResponse(value) {
  const next = structuredClone(value);
  delete next.fingerprint;
  next.fingerprint = api.fingerprint(next);
  return next;
}

function throwsCode(operation, code) {
  assert.throws(operation, (error) => error?.code === code);
}

test("minimal request has explicit scope and excludes unselected project data", () => {
  const result = request(["recipient_information"]);
  assert.deepEqual(result.scope.groups, ["recipient_information"]);
  assert.deepEqual(result.scope.editablePaths, ["details.recipient"]);
  assert.deepEqual(Object.keys(result.snapshot.values), ["details.recipient"]);
  assert.equal(JSON.stringify(result).includes("garmentLength"), false);
  assert.equal(JSON.stringify(result).includes("photo"), false);
});

test("full request contains every safe group while read-only groups stay non-editable", () => {
  const result = request(api.GROUP_ORDER);
  assert.deepEqual(result.scope.groups, api.GROUP_ORDER);
  assert.equal(result.snapshot.values["context.garmentType"].editable, false);
  assert.equal(result.snapshot.values["context.summary"].editable, false);
  assert.equal(result.scope.editablePaths.includes("context.summary"), false);
  assert.equal(result.snapshot.values["details.bodyMeasurements.head"].value, null);
});

test("scope normalization is explicit, ordered, idempotent and does not mutate input", () => {
  const groups = ["summary", "body_measurements", "body_measurements", "unknown"];
  const before = structuredClone(groups);
  const normalized = api.normalizeEditableScope(groups);
  assert.deepEqual(normalized, ["body_measurements", "summary"]);
  assert.deepEqual(api.normalizeEditableScope(normalized), normalized);
  assert.deepEqual(groups, before);
});

test("fingerprints and canonical serialization ignore object key order", () => {
  assert.equal(api.fingerprint({ b: 2, a: { d: 4, c: 3 } }), api.fingerprint({ a: { c: 3, d: 4 }, b: 2 }));
  assert.equal(api.serializePackage({ b: 2, a: 1 }), '{"a":1,"b":2}\n');
  assert.equal(request().fingerprint, request().fingerprint);
});

test("request validation rejects kind, version, foreign project and tampered snapshot", () => {
  const source = request();
  throwsCode(() => api.validateCollaborationRequest({ ...source, kind: "OTHER" }), "INVALID_REQUEST_KIND");
  throwsCode(() => api.validateCollaborationRequest({ ...source, schemaVersion: 99 }), "UNSUPPORTED_REQUEST_VERSION");
  throwsCode(() => api.validateCollaborationRequest(source, { projectId: "01890f42-8a7b-7c6d-8e9f-012345678900" }), "REQUEST_PROJECT_MISMATCH");
  const tampered = structuredClone(source);
  tampered.snapshot.values["details.bodyMeasurements.bust"].value = 1;
  throwsCode(() => api.validateCollaborationRequest(tampered), "SNAPSHOT_FINGERPRINT_MISMATCH");
});

test("request validation rejects unknown editable paths and scope/snapshot expansion", () => {
  const unknown = request();
  unknown.scope.editablePaths.push("details.bodyMeasurements.secret");
  throwsCode(() => api.validateCollaborationRequest(unknown), "UNKNOWN_EDITABLE_PATH");
  const leaked = request();
  leaked.snapshot.values["details.fit"] = { value: "regular", provenance: "user", label: "Посадка", editable: true };
  const signed = resignRequest(leaked);
  throwsCode(() => api.validateCollaborationRequest(signed), "SNAPSHOT_SCOPE_MISMATCH");
});

test("response is tied to request/project/source identities and changes only allowed fields", () => {
  const req = request();
  const result = response(req);
  assert.equal(result.requestId, req.requestId);
  assert.equal(result.projectId, req.projectId);
  assert.equal(result.sourceIdentity, req.sourceIdentity);
  assert.deepEqual(result.proposals.map((entry) => entry.path), ["details.bodyMeasurements.bust"]);
  assert.equal(api.validateCollaborationResponse(result, req, { projectId: PROJECT_ID, now: LATER }).valid, true);
});

test("response rejects malformed JSON, mismatched identity, read-only edits and expanded scope", () => {
  const req = request(["recipient_information", "summary"]);
  throwsCode(() => api.validateCollaborationResponse("{", req), "MALFORMED_RESPONSE");
  const wrong = response(request());
  wrong.requestId = "01890f42-8a7b-7c6d-8e9f-012345678900";
  throwsCode(() => api.validateCollaborationResponse(resignResponse(wrong), request()), "RESPONSE_REQUEST_MISMATCH");
  throwsCode(() => api.buildCollaborationResponse(req, [{ path: "context.summary", value: "changed" }], { responseId: RESPONSE_ID, createdAt: LATER, expiresAt: EXPIRES, now: LATER }), "READ_ONLY_FIELD");
  const expanded = response(request());
  expanded.editablePaths.push("details.fit");
  throwsCode(() => api.validateCollaborationResponse(resignResponse(expanded), request()), "RESPONSE_SCOPE_EXPANSION");
});

test("request and response fail closed for stale, imported-unproven, quarantine and collision states", () => {
  for (const flag of ["importedUnproven", "quarantined", "collision"]) {
    const req = request();
    req.state[flag] = true;
    throwsCode(() => api.validateCollaborationRequest(req), `REQUEST_${flag === "importedUnproven" ? "IMPORTED_UNPROVEN" : flag.toUpperCase()}`);
    const res = response();
    res.state[flag] = true;
    throwsCode(() => api.validateCollaborationResponse(res, request()), `RESPONSE_${flag === "importedUnproven" ? "IMPORTED_UNPROVEN" : flag.toUpperCase()}`);
  }
  throwsCode(() => api.validateCollaborationRequest(request(), { now: "2026-10-01T00:00:00.000Z" }), "STALE_REQUEST");
  const staleResponse = response();
  staleResponse.audit.expiresAt = "2026-08-02T10:30:00.000Z";
  staleResponse.fingerprint = api.fingerprint((({ fingerprint, ...rest }) => rest)(staleResponse));
  throwsCode(() => api.validateCollaborationResponse(staleResponse, request(), { now: LATER }), "STALE_RESPONSE");
});

test("diff handles no-op, missing fill, replacement and current-project conflict", () => {
  const req = request();
  const noChange = api.buildCollaborationResponse(req, [{ path: "details.bodyMeasurements.bust", value: 90 }], { responseId: RESPONSE_ID, createdAt: LATER, expiresAt: EXPIRES, now: LATER });
  assert.deepEqual(api.computeCollaborationDiff(details(), req, noChange, { now: LATER }), []);
  const fill = response(req, [{ path: "details.bodyMeasurements.head", value: 56 }]);
  const fillDiff = api.computeCollaborationDiff(details(), req, fill, { now: LATER });
  assert.equal(fillDiff[0].base, null);
  assert.equal(fillDiff[0].conflict, false);
  const replaced = response(req);
  assert.equal(api.computeCollaborationDiff(details(), req, replaced, { now: LATER })[0].conflict, false);
  const changedCurrent = details();
  changedCurrent.bodyMeasurements.bust.value = 92;
  assert.equal(api.computeCollaborationDiff(changedCurrent, req, replaced, { now: LATER })[0].conflict, true);
});

test("apply patch accepts only explicit decisions and requires conflict confirmation", () => {
  const req = request();
  const res = response(req, [
    { path: "details.bodyMeasurements.bust", value: 94 },
    { path: "details.bodyMeasurements.waist", value: 74 },
  ]);
  const diff = api.computeCollaborationDiff(details(), req, res, { now: LATER });
  assert.deepEqual(api.buildApplyPatch(diff, {}), {});
  assert.deepEqual(api.buildApplyPatch(diff, { [diff[0].path]: "rejected", [diff[1].path]: "undecided" }), {});
  assert.deepEqual(api.buildApplyPatch(diff, { [diff[0].path]: "accepted" }), { bust: 94 });
  const current = details();
  current.bodyMeasurements.bust.value = 91;
  const conflict = api.computeCollaborationDiff(current, req, res, { now: LATER });
  throwsCode(() => api.buildApplyPatch(conflict, { [conflict[0].path]: "accepted" }), "UNCONFIRMED_CONFLICT");
  assert.equal(api.buildApplyPatch(conflict, { [conflict[0].path]: "accepted" }, [conflict[0].path]).bust, 94);
});

test("partial apply preserves unknown draft_input and Stage 58 data and records provenance", () => {
  const req = request();
  const res = response(req, [
    { path: "details.bodyMeasurements.bust", value: 94 },
    { path: "details.bodyMeasurements.waist", value: 74 },
  ]);
  const current = details();
  const diff = api.computeCollaborationDiff(current, req, res, { now: LATER });
  const draft = { unknown_stage58: { keep: true }, project_intent: { yarn: "wool" }, project_details_experience: current };
  const original = structuredClone(draft);
  const applied = api.applyAllowedPatchToDraft(draft, current, diff, { [diff[0].path]: "accepted", [diff[1].path]: "rejected" }, {
    requestId: req.requestId, responseId: res.responseId, helperLabel: "Наталья", acceptedAt: LATER,
  });
  assert.equal(applied.project_details_experience.bodyMeasurements.bust.value, 94);
  assert.equal(applied.project_details_experience.bodyMeasurements.waist.value, 72);
  assert.deepEqual(applied.unknown_stage58, { keep: true });
  assert.equal(applied.project_intent.yarn, "wool");
  assert.equal(applied.project_details_collaboration.provenance.byPath[diff[0].path].source, "collaboration_response");
  assert.equal(applied.project_details_collaboration.provenance.byPath[diff[0].path].requestId, REQUEST_ID);
  assert.deepEqual(draft, original);
});

test("Stage 58 numeric validation is reused for zero, negative, nonnumeric and excessive values", () => {
  const req = request();
  for (const value of [0, -1, "not-a-number", 501]) {
    throwsCode(() => response(req, [{ path: "details.bodyMeasurements.bust", value }]), "INVALID_PROPOSAL_VALUE");
  }
  assert.equal(detailsApi.validateField("bust", 94).valid, true);
});

test("provenance normalization is stable and idempotent", () => {
  const rows = [{ path: "details.bodyMeasurements.bust" }];
  const metadata = { requestId: REQUEST_ID, responseId: RESPONSE_ID, helperLabel: "Наталья", acceptedAt: LATER };
  const once = api.normalizeProvenance({}, rows, metadata);
  const twice = api.normalizeProvenance(once, rows, metadata);
  assert.deepEqual(twice, once);
});

test("review summary distinguishes accepted, rejected, undecided and conflicts", () => {
  const diff = [
    { path: "a", changed: true, conflict: false, decision: "undecided" },
    { path: "b", changed: true, conflict: true, decision: "undecided" },
    { path: "c", changed: false, conflict: false, decision: "undecided" },
  ];
  assert.deepEqual(api.computeReviewSummary(diff, { a: "accepted", b: "rejected" }), { total: 3, changed: 2, conflicts: 1, accepted: 1, rejected: 1, undecided: 1 });
});

test("identical response is idempotent while same identity with other content collides", () => {
  const req = request();
  const res = response(req);
  assert.equal(api.validateCollaborationResponse(res, req, { existingResponses: [structuredClone(res)] }).duplicate, true);
  const changed = response(req, [{ path: "details.bodyMeasurements.bust", value: 95 }]);
  throwsCode(() => api.validateCollaborationResponse(changed, req, { existingResponses: [res] }), "RESPONSE_IDENTITY_COLLISION");
});

test("helper draft safely reopens through ProjectRepository and incompatible request collides", async () => {
  const system = globalThis.YarnAIProjectSystem;
  const repository = new system.ProjectRepository();
  await repository.initialize();
  const req = request();
  const first = await repository.saveProjectDetailsCollaborationDraft(REQUEST_ID, PROJECT_ID, { request: req, proposals: [] }, { timestamp: CREATED });
  const updated = await repository.saveProjectDetailsCollaborationDraft(REQUEST_ID, PROJECT_ID, { request: req, proposals: [{ path: "details.recipient", value: "man" }] }, { timestamp: LATER });
  assert.equal(updated.transfer_id, first.transfer_id);
  assert.equal((await repository.getProjectDetailsCollaborationDraft(REQUEST_ID)).payload.proposals.length, 1);
  const other = request();
  other.fingerprint = "fnv1a32:00000000";
  await assert.rejects(() => repository.saveProjectDetailsCollaborationDraft(REQUEST_ID, PROJECT_ID, { request: other, proposals: [] }, { timestamp: LATER }), (error) => error.code === "COLLABORATION_REQUEST_COLLISION");
  repository.close();
});

test("schema remains v4 with sixteen stores and one production createObjectStore call", () => {
  const system = globalThis.YarnAIProjectSystem;
  assert.equal(system.DB_VERSION, 4);
  assert.equal(system.STORE_NAMES.length, 16);
  assert.equal(new Set(system.STORE_NAMES).size, 16);
  assert.equal(typeof system.ProjectRepository.prototype.saveProjectDetailsCollaborationDraft, "function");
  assert.equal(typeof system.ProjectRepository.prototype.getProjectDetailsCollaborationDraft, "function");
  const root = path.join(__dirname, "../src/yarnai/static");
  const calls = fs.readdirSync(root).filter((name) => name.endsWith(".js") && !name.includes(".test.")).flatMap((name) => [...fs.readFileSync(path.join(root, name), "utf8").matchAll(/createObjectStore\s*\(/g)]);
  assert.equal(calls.length, 1);
  assert.equal(fs.readFileSync(path.join(root, "project-details-collaboration-assistant.js"), "utf8").includes("indexedDB.open"), false);
});
