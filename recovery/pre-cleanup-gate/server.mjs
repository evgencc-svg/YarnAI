import { createHash } from "node:crypto";
import { createReadStream, existsSync } from "node:fs";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const utilityRoot = resolve(fileURLToPath(new URL(".", import.meta.url)));
const staticRoot = resolve(utilityRoot, "..");
const outputRoot = resolve(process.env.PRE_CLEANUP_OUTPUT || join(utilityRoot, "runs"));
const host = "127.0.0.1";
const port = Number(process.env.PRE_CLEANUP_PORT || 8000);
const contentTypes = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".mjs": "text/javascript; charset=utf-8", ".json": "application/json; charset=utf-8" };

function safeSegment(value, fallback) {
  return /^[a-zA-Z0-9._-]{1,120}$/.test(value || "") ? value : fallback;
}

async function utilityHash() {
  const hash = createHash("sha256");
  for (const path of [
    join(utilityRoot, "config.mjs"),
    join(utilityRoot, "gate-client.js"),
    join(utilityRoot, "index.html"),
    join(utilityRoot, "server.mjs"),
    join(staticRoot, "exact-project-handoff", "core.mjs"),
  ]) hash.update(await readFile(path));
  return hash.digest("hex");
}

const utilitySha256 = await utilityHash();

async function body(request) {
  const chunks = [];
  let length = 0;
  for await (const chunk of request) {
    length += chunk.length;
    if (length > 512 * 1024 * 1024) throw new Error("BODY_TOO_LARGE");
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

function json(response, status, payload) {
  const bytes = Buffer.from(JSON.stringify(payload, null, 2));
  response.writeHead(status, { "content-type": "application/json; charset=utf-8", "content-length": bytes.length, "cache-control": "no-store" });
  response.end(bytes);
}

const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url, `http://${host}:${port}`);
    if (url.pathname === "/health") return json(response, 200, { status: "ok", utility: "pre-cleanup-gate", utilitySha256 });
    if (url.pathname === "/api/utility-info") return json(response, 200, { version: "1.0.0", utilitySha256 });
    if (url.pathname === "/api/wait") {
      const run = safeSegment(url.searchParams.get("run"), "invalid-run");
      const kind = safeSegment(url.searchParams.get("kind"), "result");
      const path = join(outputRoot, run, `${kind}.json`);
      const deadline = Date.now() + 180000;
      while (Date.now() < deadline) {
        if (existsSync(path)) {
          response.writeHead(204, { "cache-control": "no-store" });
          response.end();
          return;
        }
        await new Promise((resolveDelay) => setTimeout(resolveDelay, 200));
      }
      return json(response, 504, { error: "WAIT_TIMEOUT", run, kind });
    }
    if (url.pathname === "/api/result" && request.method === "POST") {
      const run = safeSegment(url.searchParams.get("run"), "invalid-run");
      const kind = safeSegment(url.searchParams.get("kind"), "result");
      const bytes = await body(request);
      JSON.parse(bytes.toString("utf8"));
      const directory = join(outputRoot, run);
      await mkdir(directory, { recursive: true });
      const path = join(directory, `${kind}.json`);
      await writeFile(path, bytes);
      return json(response, 200, { saved: true, run, kind, path, bytes: bytes.length });
    }
    if (url.pathname === "/api/result" && request.method === "GET") {
      const run = safeSegment(url.searchParams.get("run"), "invalid-run");
      const kind = safeSegment(url.searchParams.get("kind"), "result");
      const path = join(outputRoot, run, `${kind}.json`);
      if (!existsSync(path)) return json(response, 404, { error: "RESULT_NOT_FOUND", run, kind });
      response.writeHead(200, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
      return createReadStream(path).pipe(response);
    }
    if (url.pathname === "/api/package") {
      const run = safeSegment(url.searchParams.get("run"), "invalid-run");
      const path = join(outputRoot, run, "recovery-package.json");
      if (!existsSync(path)) return json(response, 404, { error: "PACKAGE_NOT_FOUND", run });
      response.writeHead(200, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
      return createReadStream(path).pipe(response);
    }
    if (url.pathname === "/api/runs") return json(response, 200, existsSync(outputRoot) ? await readdir(outputRoot) : []);
    const relative = url.pathname === "/" ? "pre-cleanup-gate/index.html" : url.pathname.replace(/^\/+/, "");
    const path = resolve(staticRoot, relative);
    if (!(path === staticRoot || path.startsWith(staticRoot + sep)) || !existsSync(path)) return json(response, 404, { error: "NOT_FOUND" });
    response.writeHead(200, { "content-type": contentTypes[extname(path)] || "application/octet-stream", "cache-control": "no-store" });
    createReadStream(path).pipe(response);
  } catch (error) {
    json(response, 500, { error: error?.message || String(error) });
  }
});

await mkdir(outputRoot, { recursive: true });
server.listen(port, host, () => {
  process.stdout.write(JSON.stringify({ status: "listening", origin: `http://${host}:${port}`, staticRoot, outputRoot, utilitySha256 }) + "\n");
});
