import { mkdir, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { Dictionary, Field, Int32, List, Struct, Table, Utf8, tableFromArrays, tableToIPC, vectorFromArray } from "apache-arrow";
import avscTypes from "avsc/lib/types.js";
import { deflateSync } from "fflate";
import { parquetWriteBuffer } from "hyparquet-writer";
import { compress as snappyCompress } from "snappyjs";

const { Type } = avscTypes;
const here = fileURLToPath(new URL(".", import.meta.url));
const output = resolve(here, "../../examples/storage/global/structured-data");
const encoder = new TextEncoder();
const rowCount = 2_400;
const rows = Array.from({ length: rowCount }, (_, index) => ({
  id: index + 1,
  name: index % 17 === 0 ? null : `record-${String(index + 1).padStart(4, "0")}`,
  active: index % 3 !== 0,
  score: Math.round(((index * 19.37) % 1000) * 100) / 100,
  created_at: Date.UTC(2025, index % 12, (index % 27) + 1, index % 24, index % 60),
  category: ["alpha", "beta", "gamma", "delta"][index % 4],
  tags: [`batch-${index % 8}`, index % 2 === 0 ? "even" : "odd"],
  profile: { city: ["Toulouse", "Montpellier", "Albi"][index % 3], level: index % 6 },
  note: index % 29 === 0
    ? `quoted value, row ${index + 1}\nwith a second line and "double quotes"`
    : `Deterministic analytical fixture row ${index + 1}: ${"sample-data-".repeat(6)}`
}));

await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });

await writeFile(resolve(output, "events.ndjson"), `${rows.map((row) => JSON.stringify(row)).join("\n")}\n`);
await writeFile(resolve(output, "events-malformed.ndjson"), `${rows.slice(0, 8).map((row) => JSON.stringify(row)).join("\r\n")}\r\n{"broken":\r\n`);
const boundaryPrefixBytes = 256 * 1024 - encoder.encode('{"id":1,"text":"').length - 1;
await writeFile(
  resolve(output, "events-utf8-boundary.ndjson"),
  `{"id":1,"text":"${"x".repeat(boundaryPrefixBytes)}é"}\r\n\r\n{"id":2,"text":"after boundary"}\r\n`
);

const csvColumns = ["id", "name", "active", "score", "created_at", "category", "note"];
await writeFile(
  resolve(output, "events.csv"),
  `${csvColumns.join(",")}\r\n${rows.map((row) => csvColumns.map((column) => csvCell(row[column])).join(",")).join("\r\n")}\r\n`
);
await writeFile(
  resolve(output, "events.tsv"),
  `${csvColumns.join("\t")}\n${rows.map((row) => csvColumns.map((column) => tsvCell(row[column])).join("\t")).join("\n")}\n`
);
await writeFile(resolve(output, "events-semicolon.csv"), "id;name;note\n1;alpha;semicolon dialect\n2;beta;second row\n");
await writeFile(resolve(output, "events-missing-columns.csv"), "id,name,note\n1,alpha\n2,beta,complete,extra\n");
await writeFile(resolve(output, "events-ambiguous.csv"), "value\nalpha\nbeta\n");
await writeFile(
  resolve(output, "events-chunk-boundary.csv"),
  `id,note\n1,"${"x".repeat(256 * 1024)}\ncontinued"\n2,after boundary\n`
);

const baseArrowTable = tableFromArrays({
  id: rows.map((row) => row.id),
  name: rows.map((row) => row.name),
  active: rows.map((row) => row.active),
  score: rows.map((row) => row.score),
  created_at: rows.map((row) => new Date(row.created_at)),
  category: rows.map((row) => row.category)
});
const nestedArrowTable = new Table({
  id: baseArrowTable.getChild("id"),
  name: baseArrowTable.getChild("name"),
  active: baseArrowTable.getChild("active"),
  score: baseArrowTable.getChild("score"),
  created_at: baseArrowTable.getChild("created_at"),
  category: vectorFromArray(rows.map((row) => row.category), new Dictionary(new Utf8(), new Int32())),
  tags: vectorFromArray(rows.map((row) => row.tags), new List(new Field("item", new Utf8(), false))),
  profile: vectorFromArray(
    rows.map((row) => row.profile),
    new Struct([new Field("city", new Utf8(), false), new Field("level", new Int32(), false)])
  )
});
const arrowTable = new Table(
  nestedArrowTable.schema,
  Array.from({ length: Math.ceil(rowCount / 400) }, (_, index) => index * 400)
    .flatMap((start) => nestedArrowTable.slice(start, start + 400).batches)
);
const arrowFile = tableToIPC(arrowTable, "file");
const arrowStream = tableToIPC(arrowTable, "stream");
await writeFile(resolve(output, "events.arrow"), arrowFile);
await writeFile(resolve(output, "events.feather"), arrowFile);
await writeFile(resolve(output, "events.ipc"), arrowStream);
await writeFile(resolve(output, "events-truncated.arrow"), arrowFile.subarray(0, arrowFile.length - 12));

const avroSchema = {
  type: "record",
  name: "Event",
  namespace: "org.cagnard.fixtures",
  fields: [
    { name: "id", type: "long" },
    { name: "name", type: ["null", "string"], default: null },
    { name: "active", type: "boolean" },
    { name: "score", type: "double" },
    { name: "created_at", type: { type: "long", logicalType: "timestamp-millis" } },
    { name: "category", type: { type: "enum", name: "Category", symbols: ["alpha", "beta", "gamma", "delta"] } },
    { name: "tags", type: { type: "array", items: "string" } },
    {
      name: "profile",
      type: {
        type: "record",
        name: "Profile",
        fields: [
          { name: "city", type: "string" },
          { name: "level", type: "int" }
        ]
      }
    },
    { name: "payload", type: "bytes" },
    { name: "fingerprint", type: { type: "fixed", name: "EventFingerprint", size: 4 } },
    { name: "attributes", type: { type: "map", values: "string" } },
    { name: "choice", type: ["long", "string"] }
  ]
};
const avroRows = rows.map((row, index) => ({
  ...row,
  payload: Buffer.from([index & 0xff, (index * 3) & 0xff, (index * 7) & 0xff]),
  fingerprint: Buffer.from([0xca, 0x6e, (index >>> 8) & 0xff, index & 0xff]),
  attributes: { source: "fixture", partition: String(index % 8) },
  choice: index % 2 === 0 ? row.id : `choice-${row.id}`
}));
for (const codec of ["null", "deflate", "snappy"]) {
  const avro = avroContainer(avroSchema, avroRows, codec);
  await writeFile(resolve(output, `events-${codec}.avro`), avro);
  if (codec === "null") await writeFile(resolve(output, "events-truncated.avro"), avro.subarray(0, avro.length - 9));
}
await writeFile(resolve(output, "events-unsupported-codec.avro"), avroContainer(avroSchema, avroRows, "bzip2"));
await writeFile(
  resolve(output, "events-snappy-bad-checksum.avro"),
  avroContainer(avroSchema, avroRows, "snappy", { corruptFirstChecksum: true })
);

const parquet = parquetWriteBuffer({
  columnData: [
    { name: "id", data: rows.map((row) => row.id), type: "INT32", nullable: false },
    { name: "name", data: rows.map((row) => row.name), type: "STRING" },
    { name: "active", data: rows.map((row) => row.active), type: "BOOLEAN", nullable: false, encoding: "PLAIN" },
    { name: "score", data: rows.map((row) => row.score), type: "DOUBLE", nullable: false },
    { name: "created_at", data: rows.map((row) => new Date(row.created_at)), type: "TIMESTAMP", nullable: false },
    { name: "category", data: rows.map((row) => row.category), type: "STRING", nullable: false },
    { name: "tags", data: rows.map((row) => row.tags), type: "JSON", nullable: false },
    { name: "profile", data: rows.map((row) => row.profile), type: "JSON", nullable: false },
    { name: "note", data: rows.map((row) => row.note), type: "STRING", nullable: false }
  ],
  codec: "SNAPPY",
  rowGroupSize: 300,
  kvMetadata: [
    { key: "fixture", value: "cagnard-structured-data" },
    { key: "generated", value: "deterministic" }
  ]
});
await writeFile(resolve(output, "events.parquet"), new Uint8Array(parquet));
await writeFile(resolve(output, "events-truncated.parquet"), new Uint8Array(parquet).subarray(0, parquet.byteLength - 16));

const largeParquetRowCount = 20_000;
const largeParquet = parquetWriteBuffer({
  columnData: [
    { name: "id", data: Array.from({ length: largeParquetRowCount }, (_, index) => index + 1), type: "INT32", nullable: false },
    {
      name: "partition",
      data: Array.from({ length: largeParquetRowCount }, (_, index) => `partition-${index % 32}`),
      type: "STRING",
      nullable: false
    },
    {
      name: "payload",
      data: Array.from({ length: largeParquetRowCount }, (_, index) => deterministicPayload(index, 256)),
      type: "STRING",
      nullable: false
    }
  ],
  codec: "UNCOMPRESSED",
  rowGroupSize: 1_000,
  kvMetadata: [
    { key: "fixture", value: "cagnard-parquet-range-test" },
    { key: "generated", value: "deterministic" }
  ]
});
await writeFile(resolve(output, "events-large.parquet"), new Uint8Array(largeParquet));

await writeFile(
  resolve(output, "README.md"),
  `# Structured Data Fixtures\n\nGenerated by \`pnpm --filter @cagnard/frontend fixtures:data\`. The records are deterministic and contain nulls, nested values, logical timestamps, Avro bytes/fixed/map/union values, Arrow dictionaries and multiple batches, multiple Avro blocks and codecs, multiple Parquet row groups, quoted multiline CSV fields, UTF-8 and CSV range boundaries, malformed samples, and enough text data to exercise HTTP byte ranges. \`events-large.parquet\` is an uncompressed, multi-row-group range-access fixture.\n\nSupported viewer fixtures: Parquet, Avro OCF (null, deflate, Snappy), Arrow IPC file/stream and Feather, NDJSON, CSV, and TSV. Files containing \`truncated\`, \`malformed\`, \`boundary\`, \`ambiguous\`, \`unsupported\`, \`bad-checksum\`, or \`missing-columns\` intentionally exercise edge and error handling.\n`
);

function deterministicPayload(seed, length) {
  let state = (seed + 1) >>> 0;
  let value = "";
  while (value.length < length) {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    value += state.toString(36).padStart(7, "0");
  }
  return value.slice(0, length);
}

function avroContainer(schema, values, codec, options = {}) {
  const type = Type.forSchema(schema);
  const sync = Uint8Array.from({ length: 16 }, (_, index) => (index * 37 + 11) & 0xff);
  const metadata = new Map([
    ["avro.schema", encoder.encode(JSON.stringify(schema))],
    ["avro.codec", encoder.encode(codec)],
    ["fixture.source", encoder.encode("cagnard")]
  ]);
  const parts = [Uint8Array.of(0x4f, 0x62, 0x6a, 0x01), encodeMap(metadata), sync];
  for (let start = 0; start < values.length; start += 200) {
    const records = values.slice(start, start + 200).map((value) => Uint8Array.from(type.toBuffer(value)));
    const raw = concatenate(records);
    const encoded = codec === "deflate" ? deflateSync(raw) : codec === "snappy" ? snappyBlock(raw) : raw;
    if (options.corruptFirstChecksum && start === 0) encoded[encoded.length - 1] ^= 0xff;
    parts.push(encodeLong(records.length), encodeLong(encoded.length), encoded, sync);
  }
  return concatenate(parts);
}

function encodeMap(values) {
  const parts = [encodeLong(values.size)];
  for (const [key, value] of values) parts.push(encodeString(key), encodeBytes(value));
  parts.push(encodeLong(0));
  return concatenate(parts);
}

function encodeLong(value) {
  let encoded = (BigInt(value) << 1n) ^ (BigInt(value) >> 63n);
  const bytes = [];
  do {
    let byte = Number(encoded & 0x7fn);
    encoded >>= 7n;
    if (encoded !== 0n) byte |= 0x80;
    bytes.push(byte);
  } while (encoded !== 0n);
  return Uint8Array.from(bytes);
}

function encodeString(value) {
  return encodeBytes(encoder.encode(value));
}

function encodeBytes(value) {
  return concatenate([encodeLong(value.length), value]);
}

function snappyBlock(raw) {
  const compressed = snappyCompress(raw);
  const checksum = crc32(raw);
  return concatenate([
    compressed,
    Uint8Array.of((checksum >>> 24) & 0xff, (checksum >>> 16) & 0xff, (checksum >>> 8) & 0xff, checksum & 0xff)
  ]);
}

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function concatenate(parts) {
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const output = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    output.set(part, offset);
    offset += part.length;
  }
  return output;
}

function csvCell(value) {
  const text = value === null || value === undefined ? "" : String(value);
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function tsvCell(value) {
  return value === null || value === undefined ? "" : String(value).replaceAll("\t", " ");
}
