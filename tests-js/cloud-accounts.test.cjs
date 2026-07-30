"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const source = fs.readFileSync(
  path.join(__dirname, "..", "src", "yarnai", "static", "cloud-accounts.js"),
  "utf8",
);

function jsonResponse(status, body) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: {
      get(name) {
        return name.toLowerCase() === "content-type" ? "application/json" : null;
      },
    },
    async json() {
      return body;
    },
  };
}

function loadClient(fetch, cookie = "yarnai_csrf=safe-csrf") {
  const context = {
    fetch,
    document: { cookie },
    URLSearchParams,
    console,
  };
  context.globalThis = context;
  vm.runInNewContext(source, context);
  return new context.YarnAICloudAccounts.CloudAccountClient({
    fetch,
    cookieReader: () => cookie,
  });
}

test("registration keeps the access token only in client memory", async () => {
  const calls = [];
  const client = loadClient(async (path, options) => {
    calls.push({ path, options });
    return jsonResponse(201, {
      user: { id: "user-1", email: "person@example.com" },
      access_token: "memory-token",
    });
  });
  const result = await client.register("person@example.com", "Strong password 42!");
  assert.equal(result.user.email, "person@example.com");
  assert.equal(client.accessToken, "memory-token");
  assert.equal(calls[0].options.credentials, "same-origin");
  assert.equal(calls[0].options.headers.Authorization, undefined);
  assert.match(calls[0].options.body, /person@example\.com/);
});

test("session restore sends the double-submit CSRF token", async () => {
  const calls = [];
  const client = loadClient(async (path, options) => {
    calls.push({ path, options });
    return jsonResponse(200, {
      user: { id: "user-1", email: "person@example.com" },
      access_token: "rotated-token",
    });
  });
  await client.restoreSession();
  assert.equal(calls[0].path, "/api/v1/auth/refresh");
  assert.equal(calls[0].options.headers["X-CSRF-Token"], "safe-csrf");
  assert.equal(client.accessToken, "rotated-token");
});

test("explicit cloud copy preserves project ID and is idempotent", async () => {
  let captured;
  const client = loadClient(async (path, options) => {
    captured = { path, options };
    return jsonResponse(201, {
      project: { id: "018f1234-5678-7abc-8def-0123456789ab", title: "Шарф" },
    });
  });
  client.accessToken = "access";
  client.user = { id: "user-1", email: "person@example.com" };
  const aggregate = {
    project: {
      project_id: "018f1234-5678-7abc-8def-0123456789ab",
      title: "Шарф",
      workspace_status: "ACTIVE",
      revision: 3,
    },
    calculations: [],
    progress: [],
  };
  await client.saveLocalProject(aggregate);
  const body = JSON.parse(captured.options.body);
  assert.equal(body.project_id, aggregate.project.project_id);
  assert.deepEqual(body.payload, aggregate);
  assert.equal(
    captured.options.headers["Idempotency-Key"],
    `cloud-copy:${aggregate.project.project_id}`,
  );
  assert.equal(captured.options.headers.Authorization, "Bearer access");
});

test("failed cloud request does not mutate the local aggregate", async () => {
  const client = loadClient(async () =>
    jsonResponse(409, {
      error: {
        code: "PROJECT_ID_CONFLICT",
        message: "A project with this ID already exists.",
      },
    }),
  );
  client.accessToken = "access";
  client.user = { id: "user-1" };
  const aggregate = {
    project: {
      project_id: "018f1234-5678-7abc-8def-0123456789ab",
      title: "Local",
      workspace_status: "ACTIVE",
      revision: 1,
    },
  };
  const before = JSON.stringify(aggregate);
  await assert.rejects(
    client.saveLocalProject(aggregate),
    (error) => error.code === "PROJECT_ID_CONFLICT",
  );
  assert.equal(JSON.stringify(aggregate), before);
});

test("expired access token refreshes once and retries the cloud request", async () => {
  let listCalls = 0;
  let refreshCalls = 0;
  const client = loadClient(async (path, options) => {
    if (path === "/api/v1/projects?status=active&limit=20") {
      listCalls += 1;
      if (listCalls === 1) {
        return jsonResponse(401, {
          error: {
            code: "ACCESS_TOKEN_INVALID",
            message: "Authentication is required.",
          },
        });
      }
      assert.equal(options.headers.Authorization, "Bearer replacement-access");
      return jsonResponse(200, {
        projects: [],
        pagination: { next_cursor: null },
      });
    }
    assert.equal(path, "/api/v1/auth/refresh");
    refreshCalls += 1;
    return jsonResponse(200, {
      user: { id: "user-1", email: "person@example.com" },
      access_token: "replacement-access",
    });
  });
  client.accessToken = "expired-access";
  client.user = { id: "user-1", email: "person@example.com" };

  const result = await client.listProjects();

  assert.equal(refreshCalls, 1);
  assert.equal(listCalls, 2);
  assert.deepEqual(result.projects, []);
});

test("missing account backend keeps guest mode available", async () => {
  const client = loadClient(async () => jsonResponse(404, null));

  const restored = await client.restoreSession();

  assert.equal(restored, null);
  assert.equal(client.accessToken, null);
  assert.equal(client.user, null);
});
