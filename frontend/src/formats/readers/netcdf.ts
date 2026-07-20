import { Table, tableToIPC, type Vector } from "apache-arrow";
import type { NetCDF4 } from "@earthyscience/netcdf4-wasm";

import type {
  NetCDFDataset,
  NetCDFDimension,
  NetCDFDimensionSelection,
  NetCDFGroup,
  NetCDFSlicePlot,
  NetCDFSliceRequest,
  NetCDFSliceResult,
  NetCDFVariable,
  NetCDFVariableRole,
  StructuredInspection,
	StructuredDataLimits,
  StructuredPage,
  StructuredPageRequest,
  StructuredRelationScope,
  StructuredSourceDefinition,
  StructuredSQLRequest,
  StructuredSQLResult,
  StructuredValue,
} from "../models";
import {
  acquireDuckDBRuntime,
  invalidateDuckDBRuntime,
  configureSourceConnection,
	configureUserQueryConnection,
  type DuckDBConnection,
  type DuckDBRuntime,
  quoteIdentifier,
} from "./duckdbRuntime";
import { InMemoryStructuredSource } from "./inMemory";
import { fetchBoundedFile } from "./rangeFetch";
import {
  buildRelationVector,
  executeRelationPage,
  executeRelationSQL,
} from "./relationalSource";
import {
  inferSchema,
  normalizeValue,
  StructuredReaderError,
} from "./shared";
import type { StructuredDataSource } from "./types";

type NetCDFArray =
  | Int8Array
  | Uint8Array
  | Int16Array
  | Uint16Array
  | Int32Array
  | Uint32Array
  | Float32Array
  | Float64Array
  | BigInt64Array
  | BigUint64Array
  | string[];

interface RawGroup {
  ncid: number;
  path: string;
  variables?: Record<string, unknown>;
  dimensions?: Record<string, { size?: number; id?: number; units?: unknown }>;
  attributes?: Record<string, unknown>;
  groups?: Record<string, RawGroup>;
}

interface RawVariableInfo {
  name?: string;
  dtype?: string;
  shape?: number[];
  dimensions?: string[];
  size?: number;
  totalSize?: number;
  attributes?: Record<string, unknown>;
  chunked?: boolean;
  chunks?: number[];
}

export async function createNetCDFSource(
  definition: StructuredSourceDefinition,
  signal: AbortSignal,
  progress: (phase: string, loaded?: number, total?: number) => void,
): Promise<StructuredDataSource> {
  progress("Downloading bounded NetCDF source", 0, definition.size);
  const bytes = await fetchBoundedFile(
    definition.contentUrl,
    definition.size,
		definition.limits.netcdf.maxSourceBytes,
    signal,
  );
  signal.throwIfAborted();
  const signatureVariant = detectNetCDFSignature(bytes);
  if (!signatureVariant) {
    throw new StructuredReaderError(
      "unsupported-format",
      "This file does not have a recognized NetCDF signature.",
    );
  }
  if (signatureVariant === "NetCDF-4 / HDF5 candidate" && !containsASCII(bytes, "_NCProperties")) {
    throw new StructuredReaderError(
      "unsupported-format",
      "This HDF5 file does not contain the NetCDF-4 semantic marker and will remain a generic binary file.",
    );
  }

  progress("Initializing NetCDF-C Wasm", bytes.byteLength, bytes.byteLength);
  // The selected library checks for a browser window even though this reader
  // intentionally runs in Cagnard's dedicated structured-data worker.
  (globalThis as unknown as { window?: unknown }).window = globalThis;
  const { NetCDF4 } = await import("@earthyscience/netcdf4-wasm");
  let dataset: NetCDF4 | undefined;
  try {
    dataset = await NetCDF4.fromMemory(bytes, "r", {
      wasmPath: new URL(`${import.meta.env.BASE_URL}netcdf4-wasm.wasm`, definition.contentUrl).href,
    }, `/tmp/${safeFileName(definition.name)}`);
    signal.throwIfAborted();
    progress("Reading NetCDF hierarchy", bytes.byteLength, bytes.byteLength);
    const hierarchy = await dataset.getCompleteHierarchy() as RawGroup;
    signal.throwIfAborted();
		const catalog = await buildCatalog(
			dataset,
			hierarchy,
			signatureVariant,
			bytes.byteLength,
			definition.limits.netcdf,
			signal,
		);
    return new NetCDFStructuredSource(definition, dataset, catalog);
  } catch (caught) {
    await dataset?.close().catch(() => undefined);
    if (caught instanceof StructuredReaderError || signal.aborted) throw caught;
    throw new StructuredReaderError(
      "malformed",
      signatureVariant === "NetCDF-4 / HDF5 candidate"
        ? "The HDF5 container could not be validated as a supported NetCDF-4 dataset."
        : "The NetCDF container is malformed or uses an unsupported feature.",
      { detail: caught instanceof Error ? caught.message : String(caught) },
    );
  }
}

class NetCDFStructuredSource implements StructuredDataSource {
  private readonly catalogSource: InMemoryStructuredSource;
  private relationRuntime?: DuckDBRuntime;
  private relationConnection?: DuckDBConnection;
  private relationColumns = new Set<string>();
  private relationInspection?: StructuredInspection;
  private generation = 0;
  private closed = false;

  constructor(
    private readonly definition: StructuredSourceDefinition,
    private readonly dataset: NetCDF4,
    private readonly catalog: NetCDFDataset,
  ) {
    this.catalogSource = new InMemoryStructuredSource(
      this.catalogInspection(),
      catalog.variables.map(variableCatalogRow),
    );
  }

  async inspect(signal: AbortSignal): Promise<StructuredInspection> {
    signal.throwIfAborted();
    this.assertOpen();
    return this.relationInspection ?? this.catalogInspection();
  }

  async page(request: StructuredPageRequest, signal: AbortSignal): Promise<StructuredPage> {
    this.assertOpen();
    if (!this.relationRuntime || !this.relationConnection) {
      return this.catalogSource.page(request, signal);
    }
    return executeRelationPage(
      this.relationRuntime,
      this.relationConnection,
      this.relationColumns,
      `netcdf-slice-${this.generation}`,
      request,
      signal,
    );
  }

  relationScope(): StructuredRelationScope {
    if (!this.relationInspection?.relation) {
      throw new StructuredReaderError(
        "unsupported-format",
        "Choose and load a bounded NetCDF slice before using relational operations.",
      );
    }
    return this.relationInspection.relation;
  }

  sql(request: StructuredSQLRequest, signal: AbortSignal): Promise<StructuredSQLResult> {
    if (!this.relationRuntime || !this.relationConnection) {
      throw new StructuredReaderError(
        "unsupported-format",
        "Choose and load a bounded NetCDF slice before running SQL.",
      );
    }
    return executeRelationSQL(
      this.relationRuntime,
      this.relationConnection,
      request,
      this.generation,
			this.definition.limits.sql,
      signal,
    );
  }

  async netcdfSlice(request: NetCDFSliceRequest, signal: AbortSignal): Promise<NetCDFSliceResult> {
    this.assertOpen();
    const prepared = prepareSliceRequest(this.catalog, request);
    signal.throwIfAborted();

    const coordinateValues = new Map<string, StructuredValue[]>();
    for (const dimension of prepared.dimensions) {
      const selection = prepared.selections.get(dimension.path) as NetCDFDimensionSelection;
      const coordinate = dimension.coordinateVariablePath
        ? this.catalog.variables.find((variable) => variable.path === dimension.coordinateVariablePath)
        : undefined;
      coordinateValues.set(
        dimension.path,
        coordinate
          ? await this.readVariable(coordinate, [selection.start], [selection.count], true, signal)
          : Array.from({ length: selection.count }, (_, index) => selection.start + index),
      );
    }

    const variableValues = new Map<string, StructuredValue[]>();
    const starts = prepared.dimensions.map((dimension) => prepared.selections.get(dimension.path)?.start ?? 0);
    const counts = prepared.dimensions.map((dimension) => prepared.selections.get(dimension.path)?.count ?? 1);
    for (const variable of prepared.variables) {
      variableValues.set(
        variable.path,
        await this.readVariable(variable, starts, counts, request.decoded, signal),
      );
    }
    signal.throwIfAborted();

    const rows = expandSliceRows(
      prepared.dimensions,
      counts,
      coordinateValues,
      prepared.variables,
      variableValues,
    );
    const plot = buildSlicePlot(
      prepared,
      counts,
      coordinateValues,
      variableValues.get(prepared.variables[0].path) ?? [],
    );
    const nextGeneration = this.generation + 1;
    const runtime = await acquireDuckDBRuntime(this.definition.contentUrl, () => undefined);
    const connection = await runtime.database.connect();
    await configureSourceConnection(connection);
    const tableName = `netcdf_slice_${nextGeneration}`;
    try {
      const columns = rows.length > 0
        ? Object.keys(rows[0])
        : [...prepared.dimensions.map((dimension) => dimension.name), ...prepared.variables.map((variable) => variable.name)];
      if (rows.length === 0) {
        await connection.query(
          `CREATE TEMP TABLE ${quoteIdentifier(tableName)} (${
            columns.map((column) => `${quoteIdentifier(column)} VARCHAR`).join(", ")
          })`,
        );
      } else {
        const arrays: Record<string, Vector> = Object.fromEntries(columns.map((column) => [
          column,
          buildRelationVector(rows.map((row) => arrowValue(row[column]))),
        ]));
        await connection.insertArrowFromIPCStream(
          tableToIPC(new Table(arrays), "stream"),
          { name: tableName, create: true },
        );
      }
      await connection.query(
        `CREATE OR REPLACE TEMP VIEW data AS SELECT * FROM ${quoteIdentifier(tableName)}`,
      );
			await configureUserQueryConnection(connection);
      signal.throwIfAborted();
      const previousConnection = this.relationConnection;
      this.relationRuntime = runtime;
      this.relationConnection = connection;
      this.generation = nextGeneration;
      this.relationColumns = new Set(columns);
      const relation: StructuredRelationScope = {
        relation: "data",
        label: "Current slice",
        description: `${prepared.variables.map((variable) => variable.path).join(", ")} over ${prepared.dimensions.map((dimension) => dimension.name).join(" x ")} (${request.decoded ? "decoded" : "raw"}).`,
        exact: true,
        bounded: true,
        rowCount: rows.length,
				maximumRows: this.definition.limits.netcdf.maxProjectionRows,
				maximumBytes: this.definition.limits.netcdf.maxSliceBytes,
        generation: this.generation,
      };
      this.relationInspection = {
        ...this.catalogInspection(),
        schema: inferSchema(rows),
        capabilities: exactSliceCapabilities,
        totalRows: rows.length,
        relation,
        metadata: [
          ...this.catalogInspection().metadata,
          {
            title: "Current slice",
            values: [
              { label: "Variables", value: prepared.variables.map((variable) => variable.path) },
              { label: "Dimensions", value: prepared.dimensions.map((dimension) => dimension.path) },
              { label: "Rows", value: rows.length },
              { label: "Values", value: request.decoded ? "Decoded" : "Raw" },
            ],
          },
        ],
      };
      await previousConnection?.close().catch(() => undefined);
      const page = await this.page({ limit: 50 }, signal);
      return {
        inspection: this.relationInspection,
        page,
        projection: {
          variablePaths: prepared.variables.map((variable) => variable.path),
          dimensionPaths: prepared.dimensions.map((dimension) => dimension.path),
          selections: Array.from(prepared.selections.values()),
          xDimensionPath: prepared.xDimension?.path,
          yDimensionPath: prepared.yDimension?.path,
          decoded: request.decoded,
          rowCount: rows.length,
          plot,
        },
      };
    } catch (caught) {
      if (this.relationConnection !== connection) {
        await connection.close().catch(() => undefined);
        // A failed slice may have locked the database before the runtime
        // was adopted; never leak the locked instance to the next source.
        if (this.relationRuntime !== runtime) {
          await invalidateDuckDBRuntime(runtime).catch(() => undefined);
        }
      }
      throw caught;
    }
  }

  async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    await this.relationConnection?.close().catch(() => undefined);
    // The slice workspace lockdown is database-global and irreversible;
    // dispose the shared runtime so the next source starts unlocked.
    if (this.relationRuntime) {
      await invalidateDuckDBRuntime(this.relationRuntime).catch(() => undefined);
    }
    await this.dataset.close().catch(() => undefined);
    await this.catalogSource.close();
  }

  private catalogInspection(): StructuredInspection {
    return {
      format: "netcdf",
      formatLabel: "NetCDF scientific dataset",
      variant: this.catalog.variant,
      schema: variableCatalogSchema,
      capabilities: catalogCapabilities,
      totalRows: this.catalog.variables.length,
      metadata: [
        {
          title: "Dataset",
          values: [
            { label: "Variant", value: this.catalog.variant },
            { label: "Groups", value: this.catalog.groups.length },
            { label: "Dimensions", value: this.catalog.dimensions.length },
            { label: "Variables", value: this.catalog.variables.length },
            { label: "Buffered bytes", value: this.catalog.sourceBytes },
            { label: "Access", value: "Authenticated bounded full buffer" },
          ],
        },
      ],
      warnings: [
				`This NetCDF reader buffers files up to ${this.definition.limits.netcdf.maxSourceBytes / 1024 / 1024} MB because the pinned semantic Wasm adapter does not expose HTTP random access.`,
        "The source is read-only. SQL and exact table operations apply only after loading an explicit bounded slice.",
      ],
      netcdf: this.catalog,
    };
  }

  private async readVariable(
    variable: NetCDFVariable,
    start: number[],
    count: number[],
    decoded: boolean,
    signal: AbortSignal,
  ): Promise<StructuredValue[]> {
    signal.throwIfAborted();
    let values: NetCDFArray;
    try {
      values = await this.dataset.getSlicedVariableArray(
        variable.name,
        start,
        count,
        variable.groupPath,
      );
    } catch (caught) {
      throw new StructuredReaderError(
        "unsupported-format",
        `The variable '${variable.path}' could not be read with the selected slice.`,
        { detail: caught instanceof Error ? caught.message : String(caught) },
      );
    }
    signal.throwIfAborted();
    return Array.from(
      values as ArrayLike<string | number | bigint>,
      (value) => decodeNetCDFValue(value, variable, decoded),
    );
  }

  private assertOpen(): void {
    if (this.closed) throw new StructuredReaderError("internal", "The NetCDF source is closed.");
  }
}

async function buildCatalog(
  dataset: NetCDF4,
  hierarchy: RawGroup,
  signatureVariant: string,
  sourceBytes: number,
	limits: StructuredDataLimits["netcdf"],
  signal: AbortSignal,
): Promise<NetCDFDataset> {
  const rawGroups = flattenGroups(hierarchy);
  const groups: NetCDFGroup[] = [];
  const dimensions: NetCDFDimension[] = [];
  const variables: NetCDFVariable[] = [];
  const module = dataset.getModule();

  for (const rawGroup of rawGroups) {
    signal.throwIfAborted();
    const groupPath = normalizeGroupPath(rawGroup.path);
    const unlimitedId = module.nc_inq_unlimdim(rawGroup.ncid).unlimdimid;
    const groupDimensions: string[] = [];
    for (const [name, rawDimension] of Object.entries(rawGroup.dimensions ?? {})) {
      const path = itemPath(groupPath, name);
      const dimensionId = module.nc_inq_dimid(rawGroup.ncid, name).dimid;
      groupDimensions.push(path);
      dimensions.push({
        name,
        path,
        groupPath,
        size: Number(rawDimension.size ?? 0),
        unlimited: dimensionId !== undefined && dimensionId === unlimitedId,
        units: scalarString(rawDimension.units),
      });
    }
    const variableIds = Array.from(await dataset.getVarIDs(rawGroup.ncid));
    const groupVariables: string[] = [];
    for (const variableId of variableIds) {
      const raw = await dataset.getVariableInfo(variableId, groupPath) as RawVariableInfo;
      const name = String(raw.name ?? `variable_${variableId}`);
      const path = itemPath(groupPath, name);
      const dimensionNames = (raw.dimensions ?? []).map(String);
      const dimensionPaths = dimensionNames.map((dimensionName) =>
        resolveDimensionPath(dimensions, groupPath, dimensionName)
      );
      const attributes = normalizeAttributes(raw.attributes ?? {});
      const variable: NetCDFVariable = {
        name,
        path,
        groupPath,
        physicalType: raw.dtype ?? "unknown",
        dimensions: dimensionNames,
        dimensionPaths,
        shape: (raw.shape ?? []).map(Number),
        size: Number(raw.size ?? 0),
        byteSize: raw.totalSize === undefined ? undefined : Number(raw.totalSize),
        chunked: Boolean(raw.chunked),
        chunks: raw.chunks?.map(Number),
        compression: raw.chunked ? "Chunked (filter details unavailable)" : "Contiguous",
        attributes,
        units: attributeString(attributes.units),
        standardName: attributeString(attributes.standard_name),
        longName: attributeString(attributes.long_name),
        calendar: attributeString(attributes.calendar),
        role: "data",
      };
      variable.role = inferVariableRole(variable);
      variables.push(variable);
      groupVariables.push(path);
    }
    groups.push({
      name: groupPath === "/" ? "/" : groupPath.split("/").at(-1) ?? groupPath,
      path: groupPath,
      parentPath: groupPath === "/" ? undefined : parentGroupPath(groupPath),
      dimensions: groupDimensions,
      variables: groupVariables,
      attributes: normalizeAttributes(rawGroup.attributes ?? {}),
    });
  }

  dimensions.forEach((dimension) => {
    const coordinate = variables.find((variable) =>
      variable.name === dimension.name &&
      variable.dimensionPaths.length === 1 &&
      variable.dimensionPaths[0] === dimension.path
    );
    if (coordinate) {
      dimension.coordinateVariablePath = coordinate.path;
      dimension.units = coordinate.units ?? dimension.units;
      coordinate.role = inferCoordinateRole(coordinate);
    }
  });

  const enhanced = groups.length > 1 || variables.some((variable) =>
    /enum|string|compound|opaque|vlen/i.test(variable.physicalType)
  );
  const variant = signatureVariant === "NetCDF-4 / HDF5 candidate"
    ? enhanced ? "NetCDF-4 enhanced model" : "NetCDF-4 classic model"
    : signatureVariant;
  return {
    variant,
    groups,
    dimensions,
    variables,
    sourceBytes,
		sourceByteLimit: limits.maxSourceBytes,
		sliceCellLimit: limits.maxSliceCells,
		sliceByteLimit: limits.maxSliceBytes,
		projectionRowLimit: limits.maxProjectionRows,
		plotCellLimit: limits.maxPlotCells,
    accessMode: "bounded-buffer",
  };
}

interface PreparedSlice {
  variables: NetCDFVariable[];
  dimensions: NetCDFDimension[];
  selections: Map<string, NetCDFDimensionSelection>;
  xDimension?: NetCDFDimension;
  yDimension?: NetCDFDimension;
	plotCellLimit: number;
}

export function prepareSliceRequest(catalog: NetCDFDataset, request: NetCDFSliceRequest): PreparedSlice {
  const uniqueVariables = Array.from(new Set(request.variablePaths));
  if (uniqueVariables.length === 0) {
    throw new StructuredReaderError("query", "Choose at least one NetCDF variable.");
  }
  const variables = uniqueVariables.map((path) => {
    const variable = catalog.variables.find((candidate) => candidate.path === path);
    if (!variable) throw new StructuredReaderError("query", `Unknown NetCDF variable '${path}'.`);
    return variable;
  });
  const dimensionPaths = variables[0].dimensionPaths;
  if (variables.some((variable) => !sameStrings(variable.dimensionPaths, dimensionPaths))) {
    throw new StructuredReaderError(
      "query",
      "Selected variables must use the same dimensions in the same order. Choose compatible variables instead of an implicit join.",
    );
  }
  const dimensions = dimensionPaths.map((path) => {
    const dimension = catalog.dimensions.find((candidate) => candidate.path === path);
    if (!dimension) throw new StructuredReaderError("malformed", `Dimension '${path}' is not available.`);
    return dimension;
  });
  const selections = new Map(request.selections.map((selection) => [selection.dimensionPath, selection]));
  if (selections.size !== dimensions.length) {
    throw new StructuredReaderError("query", "Every active dimension needs one explicit bounded selection.");
  }
  let cells = 1;
  dimensions.forEach((dimension) => {
    const selection = selections.get(dimension.path);
    if (
      !selection || !Number.isSafeInteger(selection.start) || selection.start < 0 ||
      !Number.isSafeInteger(selection.count) || selection.count < 1 ||
      selection.start + selection.count > dimension.size
    ) {
      throw new StructuredReaderError("query", `The selection for '${dimension.name}' is outside its ${dimension.size.toLocaleString()} values.`);
    }
    cells *= selection.count;
  });
  if (cells > catalog.sliceCellLimit || cells > catalog.projectionRowLimit) {
    throw new StructuredReaderError(
      "limit",
      `This slice contains ${cells.toLocaleString()} cells. Narrow it below ${Math.min(catalog.sliceCellLimit, catalog.projectionRowLimit).toLocaleString()} cells.`,
    );
  }
  const estimatedBytes = cells * variables.reduce((total, variable) => total + bytesPerType(variable.physicalType), 0);
  if (estimatedBytes > catalog.sliceByteLimit) {
    throw new StructuredReaderError(
      "limit",
      `This slice needs approximately ${formatBytes(estimatedBytes)}. Narrow it below the ${formatBytes(catalog.sliceByteLimit)} slice limit.`,
    );
  }
  const xDimension = request.xDimensionPath
    ? dimensions.find((dimension) => dimension.path === request.xDimensionPath)
    : dimensions.length > 0 ? dimensions.at(-1) : undefined;
  const yDimension = request.yDimensionPath
    ? dimensions.find((dimension) => dimension.path === request.yDimensionPath)
    : dimensions.length > 1 ? dimensions.at(-2) : undefined;
  if (request.xDimensionPath && !xDimension) throw new StructuredReaderError("query", "The X dimension is not active for these variables.");
  if (request.yDimensionPath && !yDimension) throw new StructuredReaderError("query", "The Y dimension is not active for these variables.");
  if (xDimension && yDimension?.path === xDimension.path) {
    throw new StructuredReaderError("query", "X and Y must use different dimensions.");
  }
	return {
		variables,
		dimensions,
		selections,
		xDimension,
		yDimension,
		plotCellLimit: catalog.plotCellLimit,
	};
}

export function decodeNetCDFValue(
  raw: string | number | bigint,
  variable: NetCDFVariable,
  decoded: boolean,
): StructuredValue {
  if (!decoded || typeof raw === "string") return normalizeValue(raw);
  const fillValues = [
    ...attributeNumbers(variable.attributes._FillValue),
    ...attributeNumbers(variable.attributes.missing_value),
  ];
  const numericRaw = typeof raw === "bigint" ? Number(raw) : raw;
  if (fillValues.some((fill) => Object.is(fill, numericRaw) || fill === numericRaw)) return null;
  const scale = attributeNumbers(variable.attributes.scale_factor)[0] ?? 1;
  const offset = attributeNumbers(variable.attributes.add_offset)[0] ?? 0;
  return normalizeValue(numericRaw * scale + offset);
}

function expandSliceRows(
  dimensions: NetCDFDimension[],
  counts: number[],
  coordinates: Map<string, StructuredValue[]>,
  variables: NetCDFVariable[],
  values: Map<string, StructuredValue[]>,
): Array<Record<string, StructuredValue>> {
  const rowCount = counts.reduce((total, count) => total * count, 1);
  const dimensionColumns = uniqueDisplayNames(dimensions.map((dimension) => dimension.name), dimensions.map((dimension) => dimension.path));
  const variableColumns = uniqueDisplayNames(variables.map((variable) => variable.name), variables.map((variable) => variable.path));
  const rows: Array<Record<string, StructuredValue>> = [];
  for (let flatIndex = 0; flatIndex < rowCount; flatIndex += 1) {
    let remainder = flatIndex;
    const indices = new Array(counts.length).fill(0);
    for (let dimensionIndex = counts.length - 1; dimensionIndex >= 0; dimensionIndex -= 1) {
      indices[dimensionIndex] = remainder % counts[dimensionIndex];
      remainder = Math.floor(remainder / counts[dimensionIndex]);
    }
    const row: Record<string, StructuredValue> = {};
    dimensions.forEach((dimension, index) => {
      row[dimensionColumns[index]] = coordinates.get(dimension.path)?.[indices[index]] ?? indices[index];
    });
    variables.forEach((variable, index) => {
      row[variableColumns[index]] = values.get(variable.path)?.[flatIndex] ?? null;
    });
    rows.push(row);
  }
  return rows;
}

function buildSlicePlot(
  prepared: PreparedSlice,
  counts: number[],
  coordinates: Map<string, StructuredValue[]>,
  values: StructuredValue[],
): NetCDFSlicePlot {
  const variable = prepared.variables[0];
  const xIndex = prepared.xDimension ? prepared.dimensions.findIndex((dimension) => dimension.path === prepared.xDimension?.path) : -1;
  const yIndex = prepared.yDimension ? prepared.dimensions.findIndex((dimension) => dimension.path === prepared.yDimension?.path) : -1;
  const nonDisplayRange = counts.some((count, index) => index !== xIndex && index !== yIndex && count > 1);
  const width = xIndex >= 0 ? counts[xIndex] : 1;
  const height = yIndex >= 0 ? counts[yIndex] : 1;
  const plotCells = width * height;
  const kind: NetCDFSlicePlot["kind"] = values.length === 1
    ? "scalar"
		: nonDisplayRange || plotCells > prepared.plotCellLimit
    ? "table"
    : yIndex >= 0
    ? "heatmap"
    : "line";
  const plotValues = kind === "table"
    ? []
    : collectPlotValues(values, counts, xIndex, yIndex, width, height);
  return {
    kind,
    width,
    height,
    values: plotValues.map((value) => primitiveValue(value)),
    xValues: prepared.xDimension
      ? (coordinates.get(prepared.xDimension.path) ?? []).map(primitiveValue)
      : undefined,
    yValues: prepared.yDimension
      ? (coordinates.get(prepared.yDimension.path) ?? []).map(primitiveValue)
      : undefined,
    xLabel: prepared.xDimension?.name,
    yLabel: prepared.yDimension?.name,
    valueLabel: variable.name,
    units: variable.units,
  };
}

function collectPlotValues(
  values: StructuredValue[],
  counts: number[],
  xIndex: number,
  yIndex: number,
  width: number,
  height: number,
): StructuredValue[] {
  if (counts.length <= 1) return values.slice(0, width);
  const strides = counts.map((_, index) => counts.slice(index + 1).reduce((total, count) => total * count, 1));
  const result: StructuredValue[] = [];
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const flatIndex = (xIndex >= 0 ? x * strides[xIndex] : 0) + (yIndex >= 0 ? y * strides[yIndex] : 0);
      result.push(values[flatIndex] ?? null);
    }
  }
  return result;
}

function variableCatalogRow(variable: NetCDFVariable): Record<string, StructuredValue> {
  return {
    Variable: variable.name,
    Group: variable.groupPath,
    Dimensions: variable.dimensions.join(" x ") || "scalar",
    Shape: variable.shape.join(" x ") || "scalar",
    Type: variable.physicalType,
    Units: variable.units ?? null,
    "Standard name": variable.standardName ?? null,
    Role: variable.role,
  };
}

const variableCatalogSchema = [
  { name: "Variable", physicalType: "string", nullable: false },
  { name: "Group", physicalType: "string", nullable: false },
  { name: "Dimensions", physicalType: "string", nullable: false },
  { name: "Shape", physicalType: "string", nullable: false },
  { name: "Type", physicalType: "string", nullable: false },
  { name: "Units", physicalType: "string", nullable: true },
  { name: "Standard name", physicalType: "string", nullable: true },
  { name: "Role", physicalType: "string", nullable: false },
];

const catalogCapabilities = {
  exactCount: true,
  exactFilter: false,
  exactProjection: false,
  exactSort: false,
  pagination: "offset" as const,
  exportCurrentPage: false,
  sql: false,
};

const exactSliceCapabilities = {
  exactCount: true,
  exactFilter: true,
  exactProjection: true,
  exactSort: true,
  pagination: "offset" as const,
  exportCurrentPage: true,
  sql: true,
};

export function detectNetCDFSignature(bytes: Uint8Array): string | undefined {
  if (bytes.length >= 4 && bytes[0] === 0x43 && bytes[1] === 0x44 && bytes[2] === 0x46) {
    if (bytes[3] === 1) return "NetCDF classic (CDF-1)";
    if (bytes[3] === 2) return "NetCDF 64-bit offset (CDF-2)";
    if (bytes[3] === 5) return "NetCDF 64-bit data (CDF-5)";
  }
  const hdf5 = [0x89, 0x48, 0x44, 0x46, 0x0d, 0x0a, 0x1a, 0x0a];
  return hdf5.every((byte, index) => bytes[index] === byte)
    ? "NetCDF-4 / HDF5 candidate"
    : undefined;
}

function containsASCII(bytes: Uint8Array, text: string): boolean {
  const pattern = new TextEncoder().encode(text);
  outer: for (let index = 0; index <= bytes.length - pattern.length; index += 1) {
    for (let offset = 0; offset < pattern.length; offset += 1) {
      if (bytes[index + offset] !== pattern[offset]) continue outer;
    }
    return true;
  }
  return false;
}

function flattenGroups(root: RawGroup): RawGroup[] {
  const groups: RawGroup[] = [root];
  Object.values(root.groups ?? {}).forEach((group) => groups.push(...flattenGroups(group)));
  return groups;
}

function normalizeGroupPath(path: string | undefined): string {
  const normalized = `/${String(path ?? "").split("/").filter(Boolean).join("/")}`;
  return normalized === "" ? "/" : normalized;
}

function itemPath(groupPath: string, name: string): string {
  return groupPath === "/" ? `/${name}` : `${groupPath}/${name}`;
}

function parentGroupPath(path: string): string {
  const parts = path.split("/").filter(Boolean);
  parts.pop();
  return parts.length ? `/${parts.join("/")}` : "/";
}

function resolveDimensionPath(dimensions: NetCDFDimension[], groupPath: string, name: string): string {
  let current = groupPath;
  while (true) {
    const candidate = itemPath(current, name);
    if (dimensions.some((dimension) => dimension.path === candidate)) return candidate;
    if (current === "/") return candidate;
    current = parentGroupPath(current);
  }
}

function normalizeAttributes(attributes: Record<string, unknown>): Record<string, StructuredValue> {
  return Object.fromEntries(Object.entries(attributes).map(([name, value]) => [name, normalizeAttribute(value)]));
}

function normalizeAttribute(value: unknown): StructuredValue {
  if (ArrayBuffer.isView(value) && !(value instanceof DataView)) {
    const values = Array.from(value as unknown as ArrayLike<number | bigint>);
    return values.length === 1 ? normalizeValue(values[0]) : values.map((item) => normalizeValue(item));
  }
  if (Array.isArray(value) && value.length === 1) return normalizeValue(value[0]);
  return normalizeValue(value);
}

function inferVariableRole(variable: NetCDFVariable): NetCDFVariableRole {
  if (variable.dimensions.length === 1 && variable.dimensions[0] === variable.name) {
    return inferCoordinateRole(variable);
  }
  return "data";
}

function inferCoordinateRole(variable: NetCDFVariable): NetCDFVariableRole {
  const standard = (variable.standardName ?? "").toLowerCase();
  const units = (variable.units ?? "").toLowerCase();
  const axis = (attributeString(variable.attributes.axis) ?? "").toUpperCase();
  if (axis === "T" || standard === "time" || / since /.test(units)) return "time";
  if (axis === "X" || standard === "longitude" || /degrees?_e(ast)?/.test(units)) return "longitude";
  if (axis === "Y" || standard === "latitude" || /degrees?_n(orth)?/.test(units)) return "latitude";
  if (axis === "Z" || /height|depth|altitude|pressure/.test(standard)) return "vertical";
  return "coordinate";
}

function attributeString(value: StructuredValue | undefined): string | undefined {
  if (typeof value === "string") return value;
  if (Array.isArray(value) && value.length === 1 && typeof value[0] === "string") return value[0];
  return undefined;
}

function attributeNumbers(value: StructuredValue | undefined): number[] {
  if (typeof value === "number") return [value];
  if (typeof value === "string" && Number.isFinite(Number(value))) return [Number(value)];
  if (Array.isArray(value)) return value.flatMap(attributeNumbers);
  return [];
}

function scalarString(value: unknown): string | undefined {
  if (typeof value === "string") return value;
  if (Array.isArray(value) && value.length === 1) return String(value[0]);
  return undefined;
}

function bytesPerType(type: string): number {
  if (/64|double/i.test(type)) return 8;
  if (/32|float|int|uint/i.test(type)) return 4;
  if (/16|short/i.test(type)) return 2;
  if (/string|char/i.test(type)) return 16;
  return 1;
}

function arrowValue(value: StructuredValue | undefined): null | boolean | number | string {
  if (value === undefined || value === null) return null;
  if (typeof value !== "object") return value;
  return JSON.stringify(value);
}

function primitiveValue(value: StructuredValue): null | boolean | number | string {
  if (value === null || typeof value !== "object") return value;
  return JSON.stringify(value);
}

function uniqueDisplayNames(names: string[], paths: string[]): string[] {
  const counts = names.reduce((map, name) => map.set(name, (map.get(name) ?? 0) + 1), new Map<string, number>());
  return names.map((name, index) => counts.get(name) === 1 ? name : paths[index]);
}

function sameStrings(left: string[], right: string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function safeFileName(name: string): string {
  const safe = name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 100);
  return safe || "dataset.nc";
}

function formatBytes(bytes: number): string {
  return `${Math.ceil(bytes / 1024 / 1024)} MB`;
}
