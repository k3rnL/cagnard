import { readFile } from "node:fs/promises";
import { performance } from "node:perf_hooks";

import { tableFromIPC } from "apache-arrow";

const profile = process.argv.includes("--desktop") ? "desktop" : "mobile";
const targetBytes = profile === "desktop" ? 64 * 1024 * 1024 : 8 * 1024 * 1024;
const fixtures = new URL("../../examples/storage/global/structured-data/", import.meta.url);
const ndjson = await readFile(new URL("events.ndjson", fixtures), "utf8");
const csv = await readFile(new URL("events.csv", fixtures), "utf8");
const arrow = new Uint8Array(await readFile(new URL("events.arrow", fixtures)));

const results = [];
results.push(measure("NDJSON parse", ndjson.length, () => {
  const repetitions = Math.max(1, Math.ceil(targetBytes / Buffer.byteLength(ndjson)));
  let rows = 0;
  for (let iteration = 0; iteration < repetitions; iteration += 1) {
    for (const line of ndjson.split("\n")) if (line) { JSON.parse(line); rows += 1; }
  }
  return rows;
}));
results.push(measure("CSV record scan", csv.length, () => {
  const repetitions = Math.max(1, Math.ceil(targetBytes / Buffer.byteLength(csv)));
  let records = 0;
  for (let iteration = 0; iteration < repetitions; iteration += 1) records += countCSVRecords(csv);
  return records;
}));
results.push(measure("Arrow IPC decode", arrow.byteLength, () => {
  const repetitions = Math.max(1, Math.ceil(targetBytes / arrow.byteLength));
  let rows = 0;
  for (let iteration = 0; iteration < repetitions; iteration += 1) rows += tableFromIPC(arrow).numRows;
  return rows;
}));

console.log(JSON.stringify({
  profile,
  targetBytes,
  runtime: process.version,
  results
}, null, 2));

function measure(name, fixtureBytes, operation) {
  const heapBefore = process.memoryUsage().heapUsed;
  const started = performance.now();
  const rows = operation();
  const milliseconds = Math.round((performance.now() - started) * 10) / 10;
  const heapDeltaBytes = Math.max(0, process.memoryUsage().heapUsed - heapBefore);
  return { name, fixtureBytes, rows, milliseconds, heapDeltaBytes };
}

function countCSVRecords(value) {
  let inQuotes = false;
  let records = 0;
  for (let index = 0; index < value.length; index += 1) {
    if (value[index] === '"') {
      if (inQuotes && value[index + 1] === '"') index += 1;
      else inQuotes = !inQuotes;
    } else if (!inQuotes && value[index] === "\n") {
      records += 1;
    }
  }
  return records;
}
