import { Type } from "avsc/lib/types.js";
import type { Schema } from "avsc";
import { Buffer } from "buffer";
import { inflateSync } from "fflate";
import { uncompress as snappyUncompress } from "snappyjs";

import type {
  StructuredField,
  StructuredInspection,
  StructuredPage,
  StructuredPageRequest,
  StructuredSourceDefinition,
  StructuredValue,
} from "../models";
import { fetchBoundedFile } from "./rangeFetch";
import { boundedLimit, normalizeValue, StructuredReaderError } from "./shared";
import type { StructuredDataSource } from "./types";

const avroBufferLimit = 128 * 1024 * 1024;
const magic = Uint8Array.of(0x4f, 0x62, 0x6a, 0x01);

interface AvroBlock {
  count: number;
  compressedBytes: number;
  offset: number;
  encoded: Uint8Array;
}

interface AvroPageCursor {
  blockIndex: number;
  recordIndex: number;
  rowOffset: number;
}

export async function createAvroSource(
  definition: StructuredSourceDefinition,
  signal: AbortSignal,
  progress: (phase: string, loaded?: number, total?: number) => void,
): Promise<StructuredDataSource> {
  progress("Downloading Avro container", 0, definition.size);
  const bytes = await fetchBoundedFile(
    definition.contentUrl,
    definition.size,
    avroBufferLimit,
    signal,
  );
  progress("Indexing Avro blocks", bytes.length, bytes.length);
  try {
    return parseContainer(bytes, signal);
  } catch (caught) {
    if (caught instanceof StructuredReaderError) throw caught;
    throw new StructuredReaderError(
      "malformed",
      "The Avro object container is malformed or truncated.",
      {
        detail: caught instanceof Error ? caught.message : String(caught),
      },
    );
  }
}

function parseContainer(
  bytes: Uint8Array,
  signal: AbortSignal,
): StructuredDataSource {
  if (!magic.every((byte, index) => bytes[index] === byte)) {
    throw new StructuredReaderError(
      "malformed",
      "The file does not contain an Avro OCF header.",
    );
  }
  const cursor = new AvroCursor(bytes, magic.length);
  const metadata = cursor.readMap();
  const sync = cursor.readFixed(16);
  const schemaText = decodeUTF8(requiredMetadata(metadata, "avro.schema"));
  const schema = JSON.parse(schemaText) as Schema;
  const codec = metadata.has("avro.codec")
    ? decodeUTF8(requiredMetadata(metadata, "avro.codec"))
    : "null";
  if (!["null", "deflate", "snappy"].includes(codec)) {
    throw new StructuredReaderError(
      "unsupported-codec",
      `Avro codec '${codec}' is not supported.`,
      {
        detail: "Supported codecs: null, deflate, snappy.",
      },
    );
  }
  const avroType = Type.forSchema(schema);
  const blocks: AvroBlock[] = [];
  let totalRows = 0;

  while (!cursor.done()) {
    signal.throwIfAborted();
    const offset = cursor.position;
    const count = cursor.readLong();
    if (count <= 0) {
      throw new StructuredReaderError(
        "malformed",
        "An Avro block must contain a positive record count.",
      );
    }
    const blockSize = cursor.readLong();
    if (blockSize < 0) {
      throw new StructuredReaderError(
        "malformed",
        "An Avro block has a negative size.",
      );
    }
    const encoded = cursor.readFixed(blockSize);
    const blockSync = cursor.readFixed(16);
    if (!sync.every((byte, index) => blockSync[index] === byte)) {
      throw new StructuredReaderError(
        "malformed",
        `Avro sync marker mismatch at byte ${cursor.position - 16}.`,
      );
    }
    totalRows = safeAdd(totalRows, count);
    blocks.push({ count, compressedBytes: blockSize, offset, encoded });
  }

  const customMetadata = Array.from(metadata.entries())
    .filter(([key]) => key !== "avro.schema" && key !== "avro.codec")
    .map(([label, value]) => ({ label, value: safeMetadataValue(value) }));
  const inspection: StructuredInspection = {
    format: "avro",
    formatLabel: "Avro object container",
    variant: `OCF (${codec})`,
    schema: avroSchemaFields(schema),
    capabilities: {
      exactCount: true,
      exactFilter: false,
      exactProjection: false,
      exactSort: false,
      pagination: "cursor",
      exportCurrentPage: true,
    },
    totalRows,
    metadata: [
      {
        title: "Container",
        values: [
          { label: "Codec", value: codec },
          { label: "Blocks", value: blocks.length },
          { label: "Records", value: totalRows },
          { label: "Buffered size", value: bytes.length },
        ],
      },
      {
        title: "Blocks",
        values: blocks.slice(0, 100).map((block, index) => ({
          label: `Block ${index + 1}`,
          value:
            `${block.count} records, ${block.compressedBytes} bytes, offset ${block.offset}`,
        })),
      },
      { title: "Custom metadata", values: customMetadata },
    ].filter((section) => section.values.length > 0),
    warnings: [
      `Avro containers are buffered up to ${
        avroBufferLimit / 1024 / 1024
      } MB; record blocks are decoded one page at a time.`,
    ],
  };
  return new AvroSource(inspection, blocks, codec, avroType);
}

class AvroSource implements StructuredDataSource {
  constructor(
    private readonly inspectionValue: StructuredInspection,
    private readonly blocks: AvroBlock[],
    private readonly codec: string,
    private readonly avroType: Type,
  ) {}

  async inspect(signal: AbortSignal): Promise<StructuredInspection> {
    signal.throwIfAborted();
    return this.inspectionValue;
  }

  async page(
    request: StructuredPageRequest,
    signal: AbortSignal,
  ): Promise<StructuredPage> {
    if (
      request.filters?.length || request.sorts?.length ||
      request.projection?.length
    ) {
      throw new StructuredReaderError(
        "unsupported-format",
        "Global filtering, sorting, and projection are not available for block-oriented Avro inspection.",
      );
    }
    const limit = boundedLimit(request.limit);
    const initial = parseAvroCursor(request.cursor, this.blocks.length);
    const rows: Array<Record<string, StructuredValue>> = [];
    let blockIndex = initial.blockIndex;
    let recordIndex = initial.recordIndex;

    try {
      while (rows.length < limit && blockIndex < this.blocks.length) {
        signal.throwIfAborted();
        const block = this.blocks[blockIndex];
        const decoded = decodeBlock(this.codec, block.encoded);
        const buffer = Buffer.from(
          decoded.buffer,
          decoded.byteOffset,
          decoded.byteLength,
        );
        let recordOffset = 0;
        for (let index = 0; index < block.count; index += 1) {
          signal.throwIfAborted();
          const result = this.avroType.decode(buffer, recordOffset);
          if (result.offset < 0 || result.offset <= recordOffset) {
            throw new StructuredReaderError(
              "malformed",
              `Avro record ${index + 1} in block ${
                blockIndex + 1
              } is truncated.`,
            );
          }
          recordOffset = result.offset;
          if (index < recordIndex) continue;
          rows.push(normalizeRecord(result.value));
          if (rows.length >= limit) {
            const nextRecord = index + 1;
            const next = nextRecord < block.count
              ? {
                blockIndex,
                recordIndex: nextRecord,
                rowOffset: initial.rowOffset + rows.length,
              }
              : {
                blockIndex: blockIndex + 1,
                recordIndex: 0,
                rowOffset: initial.rowOffset + rows.length,
              };
            const hasMore = next.blockIndex < this.blocks.length;
            return this.pageResult(
              rows,
              initial.rowOffset,
              hasMore ? encodeAvroCursor(next) : undefined,
            );
          }
        }
        if (recordOffset !== decoded.byteLength) {
          throw new StructuredReaderError(
            "malformed",
            `Avro block ${blockIndex + 1} contains trailing record bytes.`,
          );
        }
        blockIndex += 1;
        recordIndex = 0;
      }
    } catch (caught) {
      if (
        caught instanceof StructuredReaderError ||
        (caught instanceof DOMException && caught.name === "AbortError")
      ) {
        throw caught;
      }
      throw new StructuredReaderError(
        "malformed",
        "An Avro data block is malformed or truncated.",
        {
          detail: caught instanceof Error ? caught.message : String(caught),
        },
      );
    }

    return this.pageResult(rows, initial.rowOffset, undefined);
  }

  async close(): Promise<void> {
    this.blocks.splice(0, this.blocks.length);
  }

  private pageResult(
    rows: Array<Record<string, StructuredValue>>,
    offset: number,
    nextCursor: string | undefined,
  ): StructuredPage {
    const schemaColumns = this.inspectionValue.schema.map((field) =>
      field.name
    );
    const rowColumns = Array.from(
      new Set(rows.flatMap((row) => Object.keys(row))),
    );
    return {
      columns: schemaColumns.length > 0 ? schemaColumns : rowColumns,
      rows,
      offset,
      nextCursor,
      totalRows: this.inspectionValue.totalRows,
      partial: nextCursor !== undefined,
      issues: [],
    };
  }
}

function normalizeRecord(value: unknown): Record<string, StructuredValue> {
  const normalized = normalizeValue(value);
  return normalized && typeof normalized === "object" &&
      !Array.isArray(normalized) && !("kind" in normalized)
    ? (normalized as Record<string, StructuredValue>)
    : { value: normalized };
}

function decodeBlock(codec: string, encoded: Uint8Array): Uint8Array {
  if (codec === "null") return encoded;
  if (codec === "deflate") return inflateSync(encoded);
  if (encoded.length < 4) {
    throw new StructuredReaderError(
      "malformed",
      "An Avro Snappy block is missing its checksum.",
    );
  }
  const decoded = snappyUncompress(encoded.subarray(0, encoded.length - 4));
  const checksumOffset = encoded.byteOffset + encoded.byteLength - 4;
  const expected = new DataView(encoded.buffer, checksumOffset, 4).getUint32(
    0,
    false,
  );
  const actual = crc32(decoded);
  if (actual !== expected) {
    throw new StructuredReaderError(
      "malformed",
      "An Avro Snappy block has an invalid checksum.",
    );
  }
  return decoded;
}

function encodeAvroCursor(cursor: AvroPageCursor): string {
  return `avro:${cursor.blockIndex}:${cursor.recordIndex}:${cursor.rowOffset}`;
}

function parseAvroCursor(
  value: string | undefined,
  blockCount: number,
): AvroPageCursor {
  if (!value) return { blockIndex: 0, recordIndex: 0, rowOffset: 0 };
  const [kind, blockValue, recordValue, rowValue, ...extra] = value.split(":");
  const blockIndex = Number(blockValue);
  const recordIndex = Number(recordValue);
  const rowOffset = Number(rowValue);
  if (
    kind !== "avro" ||
    extra.length > 0 ||
    !Number.isSafeInteger(blockIndex) ||
    blockIndex < 0 ||
    blockIndex > blockCount ||
    !Number.isSafeInteger(recordIndex) ||
    recordIndex < 0 ||
    !Number.isSafeInteger(rowOffset) ||
    rowOffset < 0
  ) {
    throw new StructuredReaderError(
      "malformed",
      "The Avro page cursor is invalid.",
    );
  }
  return { blockIndex, recordIndex, rowOffset };
}

class AvroCursor {
  constructor(private readonly bytes: Uint8Array, private offset: number) {}

  get position(): number {
    return this.offset;
  }

  done(): boolean {
    return this.offset >= this.bytes.length;
  }

  readLong(): number {
    let encoded = 0n;
    let shift = 0n;
    for (let index = 0; index < 10; index += 1) {
      if (this.offset >= this.bytes.length) {
        throw new StructuredReaderError(
          "malformed",
          "Unexpected end of Avro container.",
        );
      }
      const byte = BigInt(this.bytes[this.offset++]);
      encoded |= (byte & 0x7fn) << shift;
      if ((byte & 0x80n) === 0n) {
        const decoded = (encoded >> 1n) ^ -(encoded & 1n);
        const number = Number(decoded);
        if (!Number.isSafeInteger(number)) {
          throw new StructuredReaderError(
            "limit",
            "An Avro integer exceeds browser limits.",
          );
        }
        return number;
      }
      shift += 7n;
    }
    throw new StructuredReaderError(
      "malformed",
      "Invalid Avro variable-length integer.",
    );
  }

  readFixed(length: number): Uint8Array {
    if (
      !Number.isSafeInteger(length) || length < 0 ||
      this.offset + length > this.bytes.length
    ) {
      throw new StructuredReaderError(
        "malformed",
        "Unexpected end of Avro container.",
      );
    }
    const value = this.bytes.subarray(this.offset, this.offset + length);
    this.offset += length;
    return value;
  }

  readMap(): Map<string, Uint8Array> {
    const values = new Map<string, Uint8Array>();
    let count = this.readLong();
    while (count !== 0) {
      if (count < 0) {
        count = -count;
        this.readLong();
      }
      for (let index = 0; index < count; index += 1) {
        const key = decodeUTF8(this.readFixed(this.readLong()));
        values.set(key, this.readFixed(this.readLong()));
      }
      count = this.readLong();
    }
    return values;
  }
}

function avroSchemaFields(schema: Schema): StructuredField[] {
  if (
    schema && typeof schema === "object" && !Array.isArray(schema) &&
    "type" in schema && schema.type === "record"
  ) {
    const record = schema as unknown as {
      fields?: Array<
        { name: string; type: Schema; doc?: string; default?: unknown }
      >;
    };
    return (record.fields ?? []).map((field) =>
      avroField(field.name, field.type, field.doc)
    );
  }
  return [avroField("value", schema)];
}

function avroField(
  name: string,
  schema: Schema,
  doc?: string,
): StructuredField {
  if (Array.isArray(schema)) {
    return {
      name,
      physicalType: "union",
      nullable: schema.some((branch) => branch === "null"),
      children: schema.filter((branch) => branch !== "null").map((
        branch,
        index,
      ) => avroField(`branch_${index + 1}`, branch)),
      metadata: doc ? { doc } : undefined,
    };
  }
  if (typeof schema === "string") {
    return {
      name,
      physicalType: schema,
      nullable: schema === "null",
      metadata: doc ? { doc } : undefined,
    };
  }
  const typed = schema as unknown as {
    type: Schema;
    logicalType?: string;
    fields?: Array<{ name: string; type: Schema; doc?: string }>;
    items?: Schema;
    values?: Schema;
    symbols?: string[];
    size?: number;
  };
  const physicalType = typeof typed.type === "string" ? typed.type : "complex";
  let children: StructuredField[] | undefined;
  if (physicalType === "record") {
    children = (typed.fields ?? []).map((field) =>
      avroField(field.name, field.type, field.doc)
    );
  }
  if (physicalType === "array" && typed.items) {
    children = [avroField("item", typed.items)];
  }
  if (physicalType === "map" && typed.values) {
    children = [avroField("value", typed.values)];
  }
  const metadata: Record<string, string> = {};
  if (doc) metadata.doc = doc;
  if (typed.symbols) metadata.symbols = typed.symbols.join(", ");
  if (typed.size !== undefined) metadata.size = String(typed.size);
  return {
    name,
    physicalType,
    logicalType: typed.logicalType,
    nullable: false,
    children,
    metadata: Object.keys(metadata).length > 0 ? metadata : undefined,
  };
}

function requiredMetadata(
  metadata: Map<string, Uint8Array>,
  key: string,
): Uint8Array {
  const value = metadata.get(key);
  if (!value) {
    throw new StructuredReaderError(
      "malformed",
      `Avro metadata '${key}' is missing.`,
    );
  }
  return value;
}

function decodeUTF8(bytes: Uint8Array): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw new StructuredReaderError(
      "malformed",
      "Avro metadata contains invalid UTF-8.",
    );
  }
}

function safeMetadataValue(bytes: Uint8Array): StructuredValue {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return normalizeValue(bytes);
  }
}

function safeAdd(left: number, right: number): number {
  const result = left + right;
  if (!Number.isSafeInteger(result)) {
    throw new StructuredReaderError(
      "limit",
      "The Avro record count exceeds browser limits.",
    );
  }
  return result;
}

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}
