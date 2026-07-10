#!/usr/bin/env node

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, extname, join, relative, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const inputs = ["README.md", "docs", "examples/run", "assets/brand/README.md"];
const markdownFiles = inputs.flatMap((input) => collectMarkdown(resolve(root, input))).sort();
const failures = [];

for (const file of markdownFiles) {
  const content = readFileSync(file, "utf8");
  const references = [
    ...matches(content, /!?\[[^\]]*\]\(([^)]+)\)/g),
    ...matches(content, /<(?:img|a)\b[^>]+(?:src|href)=["']([^"']+)["'][^>]*>/gi),
  ];

  for (const raw of references) {
    const target = normalizeTarget(raw);
    if (!target || isExternal(target)) continue;

    const [pathname, fragment] = splitFragment(target);
    const targetFile = pathname ? resolve(dirname(file), decodeURIComponent(pathname)) : file;
    if (!existsSync(targetFile)) {
      failures.push(`${relative(root, file)}: missing ${raw}`);
      continue;
    }
    if (fragment && extname(targetFile).toLowerCase() === ".md") {
      const anchors = markdownAnchors(readFileSync(targetFile, "utf8"));
      if (!anchors.has(decodeURIComponent(fragment).toLowerCase())) {
        failures.push(`${relative(root, file)}: missing heading #${fragment} in ${relative(root, targetFile)}`);
      }
    }
  }
}

if (failures.length > 0) {
  console.error(`Documentation validation failed (${failures.length}):`);
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log(`Documentation links and assets are valid across ${markdownFiles.length} Markdown files.`);

function collectMarkdown(path) {
  if (!existsSync(path)) return [];
  if (!statSync(path).isDirectory()) return extname(path).toLowerCase() === ".md" ? [path] : [];
  return readdirSync(path, { withFileTypes: true }).flatMap((entry) => {
    if (entry.name.startsWith(".")) return [];
    return collectMarkdown(join(path, entry.name));
  });
}

function matches(content, expression) {
  const results = [];
  for (const match of content.matchAll(expression)) results.push(match[1]);
  return results;
}

function normalizeTarget(raw) {
  const value = raw.trim();
  if (value.startsWith("<") && value.includes(">")) return value.slice(1, value.indexOf(">"));
  return value.replace(/\s+["'][^"']*["']$/, "");
}

function isExternal(target) {
  return /^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(target);
}

function splitFragment(target) {
  const withoutQuery = target.split("?", 1)[0];
  const hash = withoutQuery.indexOf("#");
  return hash === -1 ? [withoutQuery, ""] : [withoutQuery.slice(0, hash), withoutQuery.slice(hash + 1)];
}

function markdownAnchors(content) {
  const anchors = new Set();
  const counts = new Map();
  for (const line of content.split(/\r?\n/)) {
    const match = line.match(/^#{1,6}\s+(.+?)\s*#*$/);
    if (!match) continue;
    const base = match[1]
      .replace(/<[^>]*>/g, "")
      .replace(/[`*_~]/g, "")
      .trim()
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s_-]/gu, "")
      .replace(/\s+/g, "-");
    const count = counts.get(base) ?? 0;
    counts.set(base, count + 1);
    anchors.add(count === 0 ? base : `${base}-${count}`);
  }
  return anchors;
}
