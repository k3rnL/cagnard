import type {
  IcebergSnapshot,
  StructuredField,
  StructuredInspection,
  StructuredPage,
  StructuredPageRequest,
  StructuredSourceDefinition,
  StructuredSQLRequest,
  StructuredSQLResult,
} from "../models";
import {
  acquireDuckDBRuntime,
  setDuckDBFullHTTPReads,
  configureSourceConnection,
  configureUserQueryConnection,
  type DuckDBConnection,
  type DuckDBRuntime,
  loadIcebergExtension,
  runDuckDBQuery,
  sqlLiteral,
  tableRows,
} from "./duckdbRuntime";
import { fetchBoundedFile } from "./rangeFetch";
import { executeRelationPage, executeRelationSQL } from "./relationalSource";
import { normalizeValue, StructuredReaderError } from "./shared";
import type { StructuredDataSource } from "./types";

interface IcebergMetadataJSON {
  "format-version"?: number;
  "table-uuid"?: string;
  "current-snapshot-id"?: string;
  snapshots?: Array<{
    "sequence-number"?: string;
    "snapshot-id"?: string;
    "parent-snapshot-id"?: string;
    "timestamp-ms"?: number;
    "manifest-list"?: string;
    summary?: Record<string, unknown>;
  }>;
  properties?: Record<string, unknown>;
  location?: string;
}

export async function createIcebergSource(
  definition: StructuredSourceDefinition,
  signal: AbortSignal,
  progress: (phase: string, loaded?: number, total?: number) => void,
): Promise<StructuredDataSource> {
  progress("Reading Iceberg metadata");
  const metadataBytes = await fetchBoundedFile(
    definition.contentUrl,
    definition.size,
		definition.limits.iceberg.maxMetadataBytes,
    signal,
  );
  let metadata: IcebergMetadataJSON;
  try {
    const text = new TextDecoder().decode(metadataBytes).replace(
      /(\"(?:current-snapshot-id|snapshot-id|parent-snapshot-id|sequence-number)\"\s*:\s*)(-?\d+)/g,
      '$1"$2"',
    );
    metadata = JSON.parse(text) as IcebergMetadataJSON;
  } catch (caught) {
    throw new StructuredReaderError("malformed", "The Iceberg metadata file is malformed.", {
      detail: caught instanceof Error ? caught.message : String(caught),
    });
  }
  if (![1, 2].includes(metadata["format-version"] ?? 0)) {
    throw new StructuredReaderError("unsupported-format", "Only Iceberg format versions 1 and 2 are supported.");
  }

  setDuckDBFullHTTPReads(definition.limits.directContentFullReads === true);
  const runtime = await acquireDuckDBRuntime(definition.contentUrl, progress);
  const connection = await runtime.database.connect();
  try {
    await configureSourceConnection(connection);
    progress("Loading Iceberg reader");
    await loadIcebergExtension(runtime, connection);
    const facade = icebergFacadeSource(definition.contentUrl);
    const source = new IcebergSource(
      definition,
      metadata,
      runtime,
      connection,
      facade.directory,
      facade.metadataVersion,
    );
    await source.initialize(signal);
    await configureUserQueryConnection(connection, {
      directories: [facade.directory],
    });
    return source;
  } catch (caught) {
    await connection.close().catch(() => undefined);
    if (caught instanceof StructuredReaderError) throw caught;
    throw new StructuredReaderError("unsupported-format", "This Iceberg table could not be opened by the pinned browser runtime.", {
      detail: caught instanceof Error ? caught.message : String(caught),
      retryable: true,
    });
  }
}

export function icebergFacadeDirectory(contentUrl: string): string {
  return icebergFacadeSource(contentUrl).directory;
}

export function icebergFacadeSource(contentUrl: string): {
  directory: string;
  metadataVersion: string;
} {
  const url = new URL(contentUrl, globalThis.location?.origin ?? "http://localhost");
  const match = /^(.*)\/metadata\/v([0-9]+)\.metadata\.json$/.exec(url.pathname);
  if (!match) {
    throw new StructuredReaderError(
      "internal",
      "The Iceberg source does not use Cagnard's authorized table facade.",
    );
  }
  url.pathname = match[1];
  url.search = "";
  url.hash = "";
  return {
    directory: url.href.replace(/\/$/, ""),
    metadataVersion: match[2],
  };
}

class IcebergSource implements StructuredDataSource {
  private generation = 0;
  private selectedSnapshotId?: string;
  private columns = new Set<string>();
  private inspectionValue?: StructuredInspection;
  private readonly snapshotsValue: IcebergSnapshot[];

  constructor(
    private readonly definition: StructuredSourceDefinition,
    private readonly metadata: IcebergMetadataJSON,
    private readonly runtime: DuckDBRuntime,
    private readonly connection: DuckDBConnection,
    private readonly tableURL: string,
    private readonly metadataVersion: string,
  ) {
    const current = metadata["current-snapshot-id"];
    this.snapshotsValue = (metadata.snapshots ?? []).map((snapshot) => ({
      sequenceNumber: snapshot["sequence-number"],
      snapshotId: snapshot["snapshot-id"] ?? "unknown",
      parentSnapshotId: snapshot["parent-snapshot-id"],
      committedAt: snapshot["timestamp-ms"] !== undefined
        ? new Date(snapshot["timestamp-ms"]).toISOString()
        : undefined,
      operation: typeof snapshot.summary?.operation === "string" ? snapshot.summary.operation : undefined,
      manifestList: snapshot["manifest-list"],
      summary: Object.fromEntries(Object.entries(snapshot.summary ?? {}).map(([key, value]) => [key, String(value)])),
      current: snapshot["snapshot-id"] === current,
    }));
  }

  async initialize(signal: AbortSignal): Promise<void> {
    await this.bindSnapshot(undefined, signal);
  }

  async inspect(signal: AbortSignal): Promise<StructuredInspection> {
    signal.throwIfAborted();
    if (!this.inspectionValue) await this.bindSnapshot(this.selectedSnapshotId, signal);
    return this.inspectionValue as StructuredInspection;
  }

  relationScope() {
    const selected = this.selectedSnapshotId ?? this.metadata["current-snapshot-id"];
    return {
      relation: "data" as const,
      label: selected ? `Snapshot ${selected}` : "Current snapshot",
      description: "The selected Iceberg snapshot is available as the read-only data relation.",
      exact: true,
      bounded: false,
      rowCount: this.inspectionValue?.totalRows,
      generation: this.generation,
    };
  }

  async page(request: StructuredPageRequest, signal: AbortSignal): Promise<StructuredPage> {
    await this.inspect(signal);
    return executeRelationPage(
      this.runtime,
      this.connection,
      this.columns,
      `iceberg-${this.definition.sourceId}-${this.generation}`,
      request,
      signal,
    );
  }

  sql(request: StructuredSQLRequest, signal: AbortSignal): Promise<StructuredSQLResult> {
		return executeRelationSQL(
			this.runtime,
			this.connection,
			request,
			this.generation,
			this.definition.limits.sql,
			signal,
		);
  }

  async icebergSnapshots(signal: AbortSignal): Promise<IcebergSnapshot[]> {
    signal.throwIfAborted();
    return this.snapshotsValue;
  }

  async selectIcebergSnapshot(snapshotId: string | undefined, signal: AbortSignal): Promise<StructuredInspection> {
    if (snapshotId !== undefined && !this.snapshotsValue.some((snapshot) => snapshot.snapshotId === snapshotId)) {
      throw new StructuredReaderError("query", "The selected Iceberg snapshot is not present in this metadata version.");
    }
    await this.bindSnapshot(snapshotId, signal);
    return this.inspectionValue as StructuredInspection;
  }

  async close(): Promise<void> {
    await this.connection.close().catch(() => undefined);
  }

  private async bindSnapshot(snapshotId: string | undefined, signal: AbortSignal): Promise<void> {
    if (snapshotId !== undefined && !/^[0-9]+$/.test(snapshotId)) {
      throw new StructuredReaderError("query", "The Iceberg snapshot identifier is invalid.");
    }
    const snapshotOption = snapshotId ? `, snapshot_from_id = ${snapshotId}` : "";
    await runDuckDBQuery(
      this.runtime,
      this.connection,
      `CREATE OR REPLACE TEMP VIEW data AS SELECT * FROM iceberg_scan(${sqlLiteral(this.tableURL)}, version = ${sqlLiteral(this.metadataVersion)}, allow_moved_paths = true${snapshotOption})`,
      signal,
      { timeoutMessage: "Opening the Iceberg snapshot exceeded the 30 second browser limit." },
    );
    const describeRows = tableRows(await runDuckDBQuery(
      this.runtime,
      this.connection,
      "DESCRIBE SELECT * FROM data",
      signal,
    ));
    const schema: StructuredField[] = describeRows.map((row) => ({
      name: String(row.column_name ?? row.column ?? row.name ?? "column"),
      physicalType: String(row.column_type ?? row.type ?? "unknown"),
      logicalType: String(row.column_type ?? row.type ?? "unknown"),
      nullable: String(row.null ?? row.nullable ?? "YES").toUpperCase() !== "NO",
    }));
    this.columns = new Set(schema.map((field) => field.name));
    const countRows = tableRows(await runDuckDBQuery(this.runtime, this.connection, "SELECT count(*) AS total FROM data", signal));
    const totalRows = Number(countRows[0]?.total ?? 0);
    this.selectedSnapshotId = snapshotId;
    this.generation += 1;
    const relation = this.relationScope();
    this.inspectionValue = {
      format: "iceberg",
      formatLabel: "Apache Iceberg",
      variant: `Format v${this.metadata["format-version"]}`,
      schema,
      capabilities: {
        exactCount: true,
        exactFilter: true,
        exactProjection: true,
        exactSort: true,
        pagination: "offset",
        exportCurrentPage: true,
        sql: true,
      },
      totalRows,
      relation: { ...relation, rowCount: totalRows },
      metadata: [
        {
          title: "Iceberg table",
          values: [
            { label: "Table UUID", value: this.metadata["table-uuid"] ?? "Unknown" },
            { label: "Format version", value: this.metadata["format-version"] ?? "Unknown" },
            { label: "Metadata snapshots", value: this.snapshotsValue.length },
            { label: "Selected snapshot", value: snapshotId ?? this.metadata["current-snapshot-id"] ?? "Current" },
            { label: "Location", value: this.metadata.location ?? "Provider-managed" },
          ],
        },
        {
          title: "Table properties",
          values: Object.entries(this.metadata.properties ?? {}).map(([label, value]) => ({ label, value: normalizeValue(value) })),
        },
      ].filter((section) => section.values.length > 0),
      warnings: ["The path-based Iceberg viewer is read-only. Unsupported delete semantics are reported as open errors."],
    };
  }
}
