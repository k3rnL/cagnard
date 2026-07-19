#!/usr/bin/env node
// Assembles the static GitHub Pages demo bundle from a built frontend, the
// WebAssembly backend, and the demo corpus. The frontend bundle is reused
// unmodified except for index.html, where the module entry is deferred
// behind the demo boot loader so the service worker controls the page
// before the app issues its first /api request.
//
// Usage: node scripts/assemble-demo.mjs <frontendDist> <wasmFile> <wasmExecFile> <corpusDir> <outDir>

import { execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const [frontendDist, wasmFile, wasmExecFile, corpusDir, outDir] = process.argv
  .slice(2)
  .map((argument) => (argument ? path.resolve(argument) : undefined));

if (!frontendDist || !wasmFile || !wasmExecFile || !corpusDir || !outDir) {
  console.error(
    "Usage: node scripts/assemble-demo.mjs <frontendDist> <wasmFile> <wasmExecFile> <corpusDir> <outDir>"
  );
  process.exit(1);
}
for (const [label, target] of [
  ["frontend dist", frontendDist],
  ["wasm file", wasmFile],
  ["wasm_exec.js", wasmExecFile],
  ["corpus dir", corpusDir],
]) {
  if (!existsSync(target)) {
    console.error(`Missing ${label}: ${target}`);
    process.exit(1);
  }
}

rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });
cpSync(frontendDist, outDir, { recursive: true });

const indexPath = path.join(outDir, "index.html");
const indexHtml = readFileSync(indexPath, "utf8");
const modulePattern = /<script type="module"[^>]*\bsrc="([^"]+)"[^>]*><\/script>/g;
const matches = [...indexHtml.matchAll(modulePattern)];
if (matches.length !== 1) {
  console.error(`Expected exactly one module script in index.html, found ${matches.length}.`);
  process.exit(1);
}
const appEntry = matches[0][1];
writeFileSync(
  indexPath,
  indexHtml.replace(
    matches[0][0],
    `<script>window.__cagnardAppEntry = ${JSON.stringify(appEntry)};</script>` +
      `<script src="demo-boot.js"></script>`
  )
);

const demoDir = path.join(scriptDir, "..", "frontend", "demo");
cpSync(path.join(demoDir, "demo-boot.js"), path.join(outDir, "demo-boot.js"));
cpSync(path.join(demoDir, "demo-sw.js"), path.join(outDir, "demo-sw.js"));
cpSync(wasmExecFile, path.join(outDir, "wasm_exec.js"));
cpSync(wasmFile, path.join(outDir, "cagnard.wasm"));

const demoDataDir = path.join(outDir, "demo-data");
cpSync(corpusDir, demoDataDir, { recursive: true });
execFileSync(
  process.execPath,
  [path.join(scriptDir, "generate-demo-manifest.mjs"), corpusDir, path.join(demoDataDir, "manifest.json")],
  { stdio: "inherit" }
);

console.log(`Assembled Pages demo bundle in ${path.relative(process.cwd(), outDir)} (entry ${appEntry}).`);
