import {
  Check,
  Grid3X3,
  LoaderCircle,
  Search,
  Square,
  Waves,
} from "lucide-react";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import type {
  NetCDFDataset,
  NetCDFDimensionSelection,
  NetCDFSliceProjection,
  NetCDFSliceRequest,
  NetCDFVariable,
  StructuredPrimitive,
} from "./models";

interface NetCDFWorkspaceProps {
  dataset: NetCDFDataset;
  projection?: NetCDFSliceProjection;
  loading: boolean;
  onLoad: (request: NetCDFSliceRequest) => void;
  onCancel: () => void;
}

export default function NetCDFWorkspace({
  dataset,
  projection,
  loading,
  onLoad,
  onCancel,
}: NetCDFWorkspaceProps) {
  const defaultVariable = dataset.variables.find((variable) => variable.role === "data") ?? dataset.variables[0];
  const [search, setSearch] = useState("");
  const [selectedPaths, setSelectedPaths] = useState<string[]>(defaultVariable ? [defaultVariable.path] : []);
  const [xDimensionPath, setXDimensionPath] = useState<string>();
  const [yDimensionPath, setYDimensionPath] = useState<string>();
  const [selections, setSelections] = useState<NetCDFDimensionSelection[]>([]);
  const [decoded, setDecoded] = useState(true);
  const [localError, setLocalError] = useState<string>();

  const selectedVariables = selectedPaths.flatMap((path) => {
    const variable = dataset.variables.find((candidate) => candidate.path === path);
    return variable ? [variable] : [];
  });
  const activeVariable = selectedVariables[0];
  const activeDimensions = activeVariable?.dimensionPaths.flatMap((path) => {
    const dimension = dataset.dimensions.find((candidate) => candidate.path === path);
    return dimension ? [dimension] : [];
  }) ?? [];
  const visibleVariables = dataset.variables.filter((variable) => {
    const query = search.trim().toLocaleLowerCase();
    return !query || [
      variable.name,
      variable.path,
      variable.groupPath,
      variable.dimensions.join(" "),
      variable.physicalType,
      variable.units ?? "",
      variable.standardName ?? "",
      variable.role,
    ].some((value) => value.toLocaleLowerCase().includes(query));
  });

  useEffect(() => {
    if (!defaultVariable) return;
    setSelectedPaths([defaultVariable.path]);
    const defaults = defaultNetCDFSliceRequest(dataset, defaultVariable);
    setXDimensionPath(defaults.xDimensionPath);
    setYDimensionPath(defaults.yDimensionPath);
    setSelections(defaults.selections);
    setDecoded(defaults.decoded);
    setLocalError(undefined);
  }, [dataset.sourceBytes, dataset.variant]);

  const selectedCells = selections.reduce((total, selection) => total * selection.count, 1);
  const estimatedBytes = selectedCells * selectedVariables.reduce((total, variable) => {
    const bytes = variable.size > 0 && variable.byteSize
      ? Math.max(1, Math.ceil(variable.byteSize / variable.size))
      : 8;
    return total + bytes;
  }, 0);
  const canLoad = selectedVariables.length > 0 &&
    selections.length === activeDimensions.length &&
    selectedCells <= dataset.sliceCellLimit &&
    selectedCells <= dataset.projectionRowLimit &&
    estimatedBytes <= dataset.sliceByteLimit;

  const selectVariable = (variable: NetCDFVariable) => {
    setLocalError(undefined);
    if (selectedPaths.includes(variable.path)) {
      if (selectedPaths.length === 1) return;
      setSelectedPaths((current) => current.filter((path) => path !== variable.path));
      return;
    }
    if (activeVariable && !netCDFVariablesCompatible(activeVariable, variable)) {
      setLocalError(`${variable.path} does not share the same ordered dimensions as ${activeVariable.path}. Choose compatible variables.`);
      return;
    }
    setSelectedPaths((current) => [...current, variable.path]);
    if (!activeVariable) {
      const defaults = defaultNetCDFSliceRequest(dataset, variable);
      setXDimensionPath(defaults.xDimensionPath);
      setYDimensionPath(defaults.yDimensionPath);
      setSelections(defaults.selections);
    }
  };

  const changeAxis = (axis: "x" | "y", path: string | undefined) => {
    setLocalError(undefined);
    if (axis === "x") {
      setXDimensionPath(path);
      if (path && path === yDimensionPath) {
        setYDimensionPath(activeDimensions.find((dimension) => dimension.path !== path)?.path);
      }
    } else {
      setYDimensionPath(path);
      if (path && path === xDimensionPath) {
        setXDimensionPath([...activeDimensions].reverse().find((dimension) => dimension.path !== path)?.path);
      }
    }
  };

  const updateSelection = (dimensionPath: string, key: "start" | "count", value: number) => {
    const dimension = dataset.dimensions.find((candidate) => candidate.path === dimensionPath);
    if (!dimension) return;
    setSelections((current) => current.map((selection) => {
      if (selection.dimensionPath !== dimensionPath) return selection;
      const start = key === "start"
        ? clampInteger(value, 0, Math.max(0, dimension.size - 1))
        : selection.start;
      const count = key === "count"
        ? clampInteger(value, 1, Math.max(1, dimension.size - start))
        : Math.min(selection.count, Math.max(1, dimension.size - start));
      return { ...selection, start, count };
    }));
  };

  const apply = () => {
    if (!canLoad) return;
    onLoad({
      variablePaths: selectedPaths,
      selections,
      xDimensionPath,
      yDimensionPath,
      decoded,
    });
  };

  return (
    <section className="netcdf-workspace" aria-label="NetCDF variable and slice controls">
      <div className="netcdf-variable-pane">
        <div className="netcdf-section-heading">
          <div>
            <strong><Waves size={17} /> Variables</strong>
            <span>{selectedPaths.length} selected · {dataset.variables.length} available</span>
          </div>
          <span className="structured-count-badge">{dataset.variant}</span>
        </div>
        <label className="structured-column-search netcdf-variable-search">
          <Search size={15} />
          <input
            aria-label="Search NetCDF variables"
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Find by name, group, dimension or role"
            type="search"
            value={search}
          />
        </label>
        <div className="netcdf-variable-list" role="listbox" aria-label="NetCDF variables" aria-multiselectable="true">
          {visibleVariables.map((variable) => {
            const selected = selectedPaths.includes(variable.path);
            return (
              <label className={selected ? "selected" : undefined} key={variable.path}>
                <input
                  aria-label={`Select ${variable.path}`}
                  checked={selected}
                  onChange={() => selectVariable(variable)}
                  type="checkbox"
                />
                <span className="netcdf-variable-name">
                  <strong>{variable.name}</strong>
                  <small>{variable.groupPath} · {variable.dimensions.join(" x ") || "scalar"}</small>
                </span>
                <span className="netcdf-variable-kind">
                  <small>{variable.physicalType}</small>
                  <small>{variable.units ?? variable.role}</small>
                </span>
              </label>
            );
          })}
          {visibleVariables.length === 0 ? <p>No variables match this search.</p> : null}
        </div>
      </div>

      <div className="netcdf-slice-pane">
        <div className="netcdf-section-heading">
          <div>
            <strong><Grid3X3 size={17} /> Bounded slice</strong>
            <span>{activeVariable ? activeVariable.path : "Choose a variable"}</span>
          </div>
          <div className="structured-mode-control" role="group" aria-label="NetCDF value mode">
            <button className={decoded ? "active" : undefined} onClick={() => setDecoded(true)} type="button">Decoded</button>
            <button className={!decoded ? "active" : undefined} onClick={() => setDecoded(false)} type="button">Raw</button>
          </div>
        </div>

        {activeVariable
          ? (
            <>
              <div className="netcdf-axis-fields">
                <label>
                  <span>X display dimension</span>
                  <select aria-label="NetCDF X display dimension" onChange={(event) => changeAxis("x", event.target.value || undefined)} value={xDimensionPath ?? ""}>
                    {activeDimensions.length === 0 ? <option value="">Scalar</option> : null}
                    {activeDimensions.map((dimension) => <option key={dimension.path} value={dimension.path}>{dimension.name}</option>)}
                  </select>
                </label>
                <label>
                  <span>Y display dimension</span>
                  <select aria-label="NetCDF Y display dimension" onChange={(event) => changeAxis("y", event.target.value || undefined)} value={yDimensionPath ?? ""}>
                    <option value="">None</option>
                    {activeDimensions.filter((dimension) => dimension.path !== xDimensionPath).map((dimension) => <option key={dimension.path} value={dimension.path}>{dimension.name}</option>)}
                  </select>
                </label>
              </div>
              <div className="netcdf-dimension-list">
                {activeDimensions.map((dimension) => {
                  const selection = selections.find((candidate) => candidate.dimensionPath === dimension.path) ?? { dimensionPath: dimension.path, start: 0, count: 1 };
                  const role = dimension.path === xDimensionPath ? "X" : dimension.path === yDimensionPath ? "Y" : "Fixed";
                  return (
                    <div className="netcdf-dimension-row" key={dimension.path}>
                      <div>
                        <strong>{dimension.name}</strong>
                        <span>{dimension.size.toLocaleString()} values{dimension.unlimited ? " · unlimited" : ""}</span>
                      </div>
                      <span className="structured-count-badge">{role}</span>
                      <label>
                        <span>Start</span>
                        <input
                          aria-label={`${dimension.name} start index`}
                          max={Math.max(0, dimension.size - 1)}
                          min={0}
                          onChange={(event) => updateSelection(dimension.path, "start", Number(event.target.value))}
                          type="number"
                          value={selection.start}
                        />
                      </label>
                      <label>
                        <span>Count</span>
                        <input
                          aria-label={`${dimension.name} value count`}
                          max={Math.max(1, dimension.size - selection.start)}
                          min={1}
                          onChange={(event) => updateSelection(dimension.path, "count", Number(event.target.value))}
                          type="number"
                          value={selection.count}
                        />
                      </label>
                    </div>
                  );
                })}
                {activeDimensions.length === 0 ? <p className="netcdf-scalar-note">This variable is scalar and will produce one row.</p> : null}
              </div>
            </>
          )
          : <p className="structured-empty">This dataset does not expose a supported variable.</p>}

        {localError ? <div className="structured-inline-error" role="alert">{localError}</div> : null}
        {!canLoad && activeVariable
          ? (
            <div className="netcdf-limit-message" role="status">
              Narrow the slice below {dataset.sliceCellLimit.toLocaleString()} cells and {formatBytes(dataset.sliceByteLimit)}.
            </div>
          )
          : null}
        <footer className="netcdf-slice-actions">
          <span>{selectedCells.toLocaleString()} cells · about {formatBytes(estimatedBytes)} · {decoded ? "decoded" : "raw"}</span>
          <button
            aria-label={loading ? "Stop loading NetCDF slice" : "Load NetCDF slice"}
            className={`primary-button compact structured-apply-button${loading ? " running" : ""}`}
            disabled={!loading && !canLoad}
            onClick={loading ? onCancel : apply}
            type="button"
          >
            {loading
              ? (
                <span className="structured-running-icon" aria-hidden="true">
                  <LoaderCircle className="spin structured-spinner-icon" size={15} />
                  <Square className="structured-stop-icon" size={14} />
                </span>
              )
              : <Check size={15} />}
            <span>{loading ? "Loading slice" : "Load slice"}</span>
          </button>
        </footer>
      </div>

      {projection ? <NetCDFPlot projection={projection} /> : null}
    </section>
  );
}

export function defaultNetCDFSliceRequest(
  dataset: NetCDFDataset,
  variable: NetCDFVariable,
): NetCDFSliceRequest {
  const dimensions = variable.dimensionPaths.flatMap((path) => {
    const dimension = dataset.dimensions.find((candidate) => candidate.path === path);
    return dimension ? [dimension] : [];
  });
  const x = dimensions.at(-1);
  const y = dimensions.length > 1 ? dimensions.at(-2) : undefined;
  let remainingCells = Math.min(dataset.sliceCellLimit, dataset.projectionRowLimit);
  const counts = new Map<string, number>();
  if (y) {
    const count = Math.min(y.size, Math.max(1, Math.floor(Math.sqrt(remainingCells))));
    counts.set(y.path, count);
    remainingCells = Math.max(1, Math.floor(remainingCells / count));
  }
  if (x) counts.set(x.path, Math.min(x.size, remainingCells));
  return {
    variablePaths: [variable.path],
    xDimensionPath: x?.path,
    yDimensionPath: y?.path,
    decoded: true,
    selections: dimensions.map((dimension) => ({
      dimensionPath: dimension.path,
      start: 0,
      count: counts.get(dimension.path) ?? 1,
    })),
  };
}

export function netCDFVariablesCompatible(left: NetCDFVariable, right: NetCDFVariable): boolean {
  return left.dimensionPaths.length === right.dimensionPaths.length &&
    left.dimensionPaths.every((path, index) => path === right.dimensionPaths[index]) &&
    left.shape.every((size, index) => size === right.shape[index]);
}

function NetCDFPlot({ projection }: { projection: NetCDFSliceProjection }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const plot = projection.plot;
  const numericValues = useMemo(
    () => plot.values.map((value) => typeof value === "number" && Number.isFinite(value) ? value : null),
    [plot.values],
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || (plot.kind !== "line" && plot.kind !== "heatmap")) return;
    const context = canvas.getContext("2d");
    if (!context) return;
    const styles = getComputedStyle(canvas);
    const accent = styles.getPropertyValue("--accent").trim() || "#255f54";
    const muted = styles.getPropertyValue("--text-muted").trim() || "#60706b";
    const surface = styles.getPropertyValue("--surface").trim() || "#ffffff";
    const border = styles.getPropertyValue("--border-soft").trim() || "#ecefea";
    const { width, height } = canvas;
    context.clearRect(0, 0, width, height);
    context.fillStyle = surface;
    context.fillRect(0, 0, width, height);
    const values = numericValues.filter((value): value is number => value !== null);
    if (!values.length) return;
    const minimum = Math.min(...values);
    const maximum = Math.max(...values);
    const span = maximum - minimum || 1;
    if (plot.kind === "line") {
      const left = 46;
      const top = 18;
      const right = width - 18;
      const bottom = height - 34;
      context.strokeStyle = border;
      context.lineWidth = 1;
      context.beginPath();
      context.moveTo(left, top);
      context.lineTo(left, bottom);
      context.lineTo(right, bottom);
      context.stroke();
      context.strokeStyle = accent;
      context.lineWidth = 2.5;
      context.beginPath();
      numericValues.forEach((value, index) => {
        if (value === null) return;
        const x = left + (index / Math.max(1, numericValues.length - 1)) * (right - left);
        const y = bottom - ((value - minimum) / span) * (bottom - top);
        if (index === 0) context.moveTo(x, y);
        else context.lineTo(x, y);
      });
      context.stroke();
      context.fillStyle = muted;
      context.font = "12px system-ui";
      context.fillText(formatNumber(maximum), 4, top + 4);
      context.fillText(formatNumber(minimum), 4, bottom + 4);
    } else {
      const cellWidth = width / Math.max(1, plot.width);
      const cellHeight = height / Math.max(1, plot.height);
      numericValues.forEach((value, index) => {
        const ratio = value === null ? -1 : (value - minimum) / span;
        context.fillStyle = ratio < 0 ? border : heatColor(ratio, accent);
        context.fillRect(
          (index % plot.width) * cellWidth,
          Math.floor(index / plot.width) * cellHeight,
          Math.ceil(cellWidth + 0.4),
          Math.ceil(cellHeight + 0.4),
        );
      });
    }
  }, [numericValues, plot.height, plot.kind, plot.width]);

  return (
    <section className="netcdf-plot" aria-label={`${plot.valueLabel} slice visualization`}>
      <header>
        <div>
          <strong>{plot.valueLabel}</strong>
          <span>{plot.kind === "heatmap" ? "2D heatmap" : plot.kind === "line" ? "1D line" : plot.kind === "scalar" ? "Scalar value" : "Table-only slice"}{plot.units ? ` · ${plot.units}` : ""}</span>
        </div>
        <span>Current slice · {projection.decoded ? "decoded" : "raw"}</span>
      </header>
      {plot.kind === "scalar"
        ? <output className="netcdf-scalar-value">{formatPrimitive(plot.values[0])}</output>
        : plot.kind === "table"
        ? <p className="netcdf-plot-fallback">This bounded slice has extra ranged dimensions or exceeds the {projection.plot.width * projection.plot.height} cell plot surface. Use the accessible table below.</p>
        : (
          <figure>
            <canvas
              aria-label={`${plot.valueLabel} ${plot.kind}`}
              height={plot.kind === "heatmap" ? 320 : 260}
              ref={canvasRef}
              role="img"
              width={800}
            />
            <figcaption>
              {plot.xLabel ?? "Index"}{plot.yLabel ? ` by ${plot.yLabel}` : ""}. The table below exposes the same values for keyboard and assistive technology users.
            </figcaption>
          </figure>
        )}
    </section>
  );
}

function clampInteger(value: number, minimum: number, maximum: number): number {
  const integer = Number.isFinite(value) ? Math.floor(value) : minimum;
  return Math.max(minimum, Math.min(maximum, integer));
}

function heatColor(value: number, accent: string): string {
  const rgb = parseHexColor(accent) ?? [37, 95, 84];
  const white = [250, 250, 247];
  return `rgb(${rgb.map((channel, index) => Math.round(white[index] + (channel - white[index]) * (0.18 + value * 0.82))).join(",")})`;
}

function parseHexColor(value: string): [number, number, number] | undefined {
  const match = value.match(/^#([0-9a-f]{6})$/i);
  if (!match) return undefined;
  return [0, 2, 4].map((offset) => Number.parseInt(match[1].slice(offset, offset + 2), 16)) as [number, number, number];
}

function formatNumber(value: number): string {
  return Math.abs(value) >= 1_000 || (Math.abs(value) > 0 && Math.abs(value) < 0.01)
    ? value.toExponential(2)
    : value.toLocaleString(undefined, { maximumFractionDigits: 3 });
}

function formatPrimitive(value: StructuredPrimitive | undefined): string {
  if (value === null || value === undefined) return "Missing";
  return typeof value === "number" ? formatNumber(value) : String(value);
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.ceil(bytes / 1024)} KB`;
  return `${Math.ceil(bytes / 1024 / 1024)} MB`;
}
