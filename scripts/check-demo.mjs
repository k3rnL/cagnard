#!/usr/bin/env node
// Validates the WebAssembly demo backend end to end under Node: builds
// cmd/cagnard-wasm, serves examples/storage/global with a generated manifest
// over a Range-capable local server, boots the module with wasm_exec.js, and
// asserts the API loop the Pages demo depends on (auth, navigation,
// listings, preview, ranged content, iceberg facade, read-only rejection).
//
// Go's js/wasm http transport disables fetch when it detects Node through
// process.argv0, so the module sees a shadowed process object.
//
// Usage: node scripts/check-demo.mjs

import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(scriptDir, "..");
const corpusDir = path.join(repoRoot, "examples", "storage", "global");
const workDir = mkdtempSync(path.join(tmpdir(), "cagnard-demo-check-"));
const wasmPath = path.join(workDir, "cagnard.wasm");
const manifestPath = path.join(workDir, "manifest.json");

function run(command, args, options = {}) {
  return execFileSync(command, args, { encoding: "utf8", ...options });
}

console.log("Building cmd/cagnard-wasm…");
run("go", ["build", "-trimpath", "-o", wasmPath, "./cmd/cagnard-wasm"], {
  cwd: path.join(repoRoot, "backend-go"),
  env: { ...process.env, GOOS: "js", GOARCH: "wasm" },
  stdio: "inherit",
});
run(process.execPath, [path.join(scriptDir, "generate-demo-manifest.mjs"), corpusDir, manifestPath], {
  stdio: "inherit",
});

const goroot = run("go", ["env", "GOROOT"]).trim();
createRequire(import.meta.url)(path.join(goroot, "lib", "wasm", "wasm_exec.js"));

const server = createServer((request, response) => {
  const relative = decodeURIComponent(
    new URL(request.url, "http://localhost").pathname.replace(/^\/demo-data\/?/, "")
  );
  let body;
  try {
    body = relative === "manifest.json" ? readFileSync(manifestPath) : readFileSync(path.join(corpusDir, relative));
  } catch {
    response.writeHead(404);
    return response.end();
  }
  const match = request.headers.range && /^bytes=(\d+)-(\d+)?$/.exec(request.headers.range);
  if (match) {
    const start = Number(match[1]);
    const end = match[2] ? Math.min(Number(match[2]), body.length - 1) : body.length - 1;
    response.writeHead(206, {
      "Content-Range": `bytes ${start}-${end}/${body.length}`,
      "Content-Length": end - start + 1,
    });
    return response.end(body.subarray(start, end + 1));
  }
  response.writeHead(200, { "Content-Length": body.length });
  response.end(body);
});

const decoder = new TextDecoder();
const failures = [];

function check(label, condition, detail) {
  if (condition) {
    console.log(`ok: ${label}`);
  } else {
    failures.push(label);
    console.error(`FAIL: ${label}${detail ? ` — ${detail}` : ""}`);
  }
}

async function exercise() {
  const login = await cagnard.handle({
    method: "POST",
    url: "/api/auth/login",
    headers: { "Content-Type": "application/json" },
    body: new TextEncoder().encode(
      JSON.stringify({ providerId: "static", username: "alice", password: "cagnard" })
    ),
  });
  const cookie = ((login.headers["Set-Cookie"] || [])[0] || "").split(";")[0];
  check("login succeeds with a session cookie", login.status === 200 && cookie.length > 0);

  const authed = (method, url, headers = {}) =>
    cagnard.handle({ method, url, headers: { Cookie: cookie, ...headers }, body: null });
  const json = (response) => JSON.parse(decoder.decode(response.body));

  const navigation = await authed("GET", "/api/storage/navigation");
  const root = json(navigation).global?.roots?.[0];
  check("navigation exposes the read-only demo root", navigation.status === 200 && root?.id === "shared" && root?.readOnly === true);
  check(
    "mutations are declared unsupported",
    root?.capabilities?.find((capability) => capability.name === "upload")?.status === "unsupported"
  );

  const entries = await authed("GET", "/api/storage/entries?tunnel=global&rootId=shared&path=");
  const names = json(entries).entries?.map((entry) => entry.name) ?? [];
  check(
    "root listing matches the corpus",
    entries.status === 200 &&
      ["compatibility-lab", "hello.txt", "iceberg", "netcdf", "readings.dat", "readme.md", "structured-data"].every(
        (expected) => names.includes(expected)
      ),
    `got: ${names.join(", ")}`
  );

  const preview = await authed(
    "GET",
    "/api/storage/preview?tunnel=global&rootId=shared&path=readme.md&maxBytes=64"
  );
  check(
    "preview reads bounded text content",
    preview.status === 200 && json(preview).content.startsWith("# Global Storage")
  );

  const ranged = await authed("GET", "/api/storage/content?tunnel=global&rootId=shared&path=readme.md", {
    Range: "bytes=2-15",
  });
  check(
    "ranged content read returns 206 with the requested bytes",
    ranged.status === 206 && decoder.decode(ranged.body) === "Global Storage",
    `status ${ranged.status}, body ${JSON.stringify(decoder.decode(ranged.body))}`
  );

  const table = Buffer.from("iceberg/lineitem").toString("base64url");
  const iceberg = await authed(
    "GET",
    `/api/storage/iceberg/content/global/shared/${table}/metadata/v2.metadata.json`
  );
  check(
    "iceberg facade serves table metadata through the http provider",
    iceberg.status === 200 && json(iceberg)["format-version"] === 2,
    `status ${iceberg.status}`
  );

  const forbidden = await cagnard.handle({
    method: "POST",
    url: "/api/storage/folders",
    headers: { Cookie: cookie, "Content-Type": "application/json" },
    body: new TextEncoder().encode(
      JSON.stringify({ tunnel: "global", rootId: "shared", parentPath: "", name: "nope" })
    ),
  });
  check(
    "mutations are rejected as read_only_root",
    forbidden.status === 400 && json(forbidden).code === "read_only_root"
  );
}

server.listen(0, "127.0.0.1", () => {
  globalThis.__cagnardDemoDataURL = `http://127.0.0.1:${server.address().port}/demo-data`;
  const shadow = {};
  for (const key of Reflect.ownKeys(process)) {
    try {
      shadow[key] = process[key];
    } catch {
      // Some process properties are throwing accessors; the shadow can skip them.
    }
  }
  shadow.argv0 = "cagnard-demo-check";
  globalThis.process = shadow;

  globalThis.__onCagnardReady = async () => {
    try {
      await exercise();
    } catch (error) {
      failures.push("unexpected error");
      console.error("FAIL: unexpected error —", error);
    } finally {
      server.close();
      rmSync(workDir, { recursive: true, force: true });
      if (failures.length > 0) {
        console.error(`Demo check failed: ${failures.length} assertion(s).`);
        globalThis.process.exit(1);
      }
      console.log("Demo backend check passed.");
      globalThis.process.exit(0);
    }
  };

  const go = new Go();
  WebAssembly.instantiate(readFileSync(wasmPath), go.importObject).then((result) => {
    go.run(result.instance);
  });
});
