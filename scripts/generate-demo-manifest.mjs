#!/usr/bin/env node
// Generates the manifest.json consumed by the backend "http" storage
// provider. Walks a file tree and emits path/kind/size/modifiedTime for
// every entry, using the last git commit date when available so output is
// stable across CI checkouts.
//
// Usage: node scripts/generate-demo-manifest.mjs [rootDir] [outFile]
//   rootDir  defaults to examples/storage/global
//   outFile  defaults to stdout

import { execFileSync } from "node:child_process";
import { readdirSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";

const rootDir = path.resolve(process.argv[2] ?? "examples/storage/global");
const outFile = process.argv[3] ? path.resolve(process.argv[3]) : null;

function gitModifiedTime(absolutePath) {
  try {
    const output = execFileSync(
      "git",
      ["log", "-1", "--format=%cI", "--", absolutePath],
      { cwd: rootDir, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }
    ).trim();
    return output || null;
  } catch {
    return null;
  }
}

function modifiedTime(absolutePath) {
  const fromGit = gitModifiedTime(absolutePath);
  if (fromGit) {
    return new Date(fromGit).toISOString();
  }
  return statSync(absolutePath).mtime.toISOString();
}

const entries = [];

function walk(relative) {
  const absolute = path.join(rootDir, relative);
  for (const dirent of readdirSync(absolute, { withFileTypes: true }).sort((a, b) =>
    a.name.localeCompare(b.name)
  )) {
    if (dirent.name.startsWith(".") || dirent.name === "manifest.json") {
      continue;
    }
    const childRelative = relative ? `${relative}/${dirent.name}` : dirent.name;
    const childAbsolute = path.join(rootDir, childRelative);
    if (dirent.isDirectory()) {
      entries.push({
        path: childRelative,
        kind: "directory",
        modifiedTime: modifiedTime(childAbsolute),
      });
      walk(childRelative);
    } else if (dirent.isFile()) {
      entries.push({
        path: childRelative,
        kind: "file",
        size: statSync(childAbsolute).size,
        modifiedTime: modifiedTime(childAbsolute),
      });
    }
  }
}

walk("");
entries.sort((a, b) => a.path.localeCompare(b.path));

const manifest = {
  version: 1,
  generatedAt: new Date().toISOString(),
  root: path.basename(rootDir),
  entries,
};

const json = JSON.stringify(manifest, null, 2) + "\n";
if (outFile) {
  writeFileSync(outFile, json);
  const files = entries.filter((entry) => entry.kind === "file").length;
  const directories = entries.length - files;
  console.log(
    `Wrote ${path.relative(process.cwd(), outFile)}: ${files} files, ${directories} directories.`
  );
} else {
  process.stdout.write(json);
}
