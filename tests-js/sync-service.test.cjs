"use strict";

const assert = require("node:assert/strict");
const { afterEach, beforeEach, test } = require("node:test");
require("fake-indexeddb/auto");

global.window = globalThis;
require("../src/yarnai/static/project-system.js");
require("../src/yarnai/static/sync-service.js");

const { DB_NAME, ProjectRepository, isUuidv7 } = global.YarnAIProjectSystem;
const { SyncService } = global.YarnAISync;
let repositories = [];

function repository() {
  const value = new ProjectRepository();
  repositories.push(value);
  return value;
}

function deleteDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.deleteDatabase(DB_NAME);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error("database deletion blocked"));
  });
}

beforeEach(async () => {
  repositories = [];
  await deleteDatabase();
});

afterEach(async () => {
  await Promise.all(repositories.map((entry) => entry.close()));
  await deleteDatabase();
});

test("local project change creates a persistent pending Outbox operation", async () => {
  const repo = repository();
  const project = await repo.createProject({ title: "Outbox" });

  const operations = await repo.getOutboxOperations();

  assert.equal(operations.length, 1);
  assert.equal(isUuidv7(operations[0].operation_id), true);
  assert.equal(operations[0].project_id, project.project_id);
  assert.equal(operations[0].revision, 1);
  assert.equal(operations[0].operation_type, "PROJECT_CREATED");
  assert.equal(operations[0].state, "pending");
  assert.equal(operations[0].payload.project.project_id, project.project_id);
});

test("successful upload acknowledgement marks the operation uploaded", async () => {
  const repo = repository();
  const project = await repo.createProject({ title: "Acknowledge" });
  const apiClient = {
    async uploadOperations(operations) {
      return {
        confirmed_operations: operations.map((operation) => ({
          operation_id: operation.operation_id,
          project_id: operation.project_id,
          revision: operation.revision,
          server_revision: operation.revision,
        })),
        server_revisions: { [project.project_id]: 1 },
        errors: [],
      };
    },
  };
  const service = new SyncService(repo, apiClient, { retryDelayMs: 0 });

  const result = await service.uploadPending();

  assert.equal(result.confirmed_operations.length, 1);
  assert.equal((await repo.getOutboxOperations()).length, 0);
  const uploaded = await repo.getOutboxOperations({ states: ["uploaded"] });
  assert.equal(uploaded.length, 1);
  assert.equal(uploaded[0].server_version, 1);
});

test("retry is limited to temporary errors and never retries 409", async () => {
  const repo = repository();
  const project = await repo.createProject({ title: "Retry" });
  let temporaryCalls = 0;
  const temporaryApi = {
    async uploadOperations(operations) {
      temporaryCalls += 1;
      if (temporaryCalls === 1) {
        throw Object.assign(new Error("offline"), {
          code: "NETWORK_ERROR",
          status: 0,
        });
      }
      return {
        confirmed_operations: operations.map((operation) => ({
          operation_id: operation.operation_id,
          project_id: operation.project_id,
          revision: operation.revision,
          server_revision: operation.revision,
        })),
        server_revisions: { [project.project_id]: 1 },
        errors: [],
      };
    },
  };
  await new SyncService(repo, temporaryApi, {
    retryDelayMs: 0,
    maxRetries: 2,
  }).uploadPending();
  assert.equal(temporaryCalls, 2);

  await repo.updateProject(project.project_id, { notes: "conflict" });
  let conflictCalls = 0;
  const conflictApi = {
    async uploadOperations() {
      conflictCalls += 1;
      throw Object.assign(new Error("revision conflict"), {
        code: "REVISION_CONFLICT",
        status: 409,
      });
    },
  };
  await assert.rejects(
    new SyncService(repo, conflictApi, {
      retryDelayMs: 0,
      maxRetries: 3,
    }).uploadPending(),
    (error) => error.status === 409 && error.retryable === false,
  );
  assert.equal(conflictCalls, 1);
  const failed = await repo.getOutboxOperations({ states: ["failed"] });
  assert.equal(failed.length, 1);
  assert.equal(failed[0].retryable, false);
});

test("pending Outbox operations survive repository restart without loss", async () => {
  const first = repository();
  const project = await first.createProject({ title: "Restart" });
  const operationId = (await first.getOutboxOperations())[0].operation_id;
  await first.close();
  repositories = repositories.filter((entry) => entry !== first);

  const reopened = repository();
  await reopened.initialize();
  const pending = await reopened.getOutboxOperations({
    projectId: project.project_id,
  });

  assert.equal(pending.length, 1);
  assert.equal(pending[0].operation_id, operationId);
  assert.equal(pending[0].state, "pending");
});