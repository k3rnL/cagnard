import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import NetCDFWorkspace, {
  defaultNetCDFSliceRequest,
  netCDFVariablesCompatible,
} from "./NetCDFWorkspace";
import type { NetCDFDataset, NetCDFVariable } from "./models";

describe("NetCDF workspace", () => {
  it("chooses bounded CF-shaped defaults and recognizes compatible variables", () => {
    const dataset = fixture();
    const request = defaultNetCDFSliceRequest(dataset, dataset.variables[0]);
    expect(request.xDimensionPath).toBe("/longitude");
    expect(request.yDimensionPath).toBe("/latitude");
    expect(request.selections).toEqual([
      { dimensionPath: "/time", start: 0, count: 1 },
      { dimensionPath: "/latitude", start: 0, count: 5 },
      { dimensionPath: "/longitude", start: 0, count: 8 },
    ]);
    expect(netCDFVariablesCompatible(dataset.variables[0], dataset.variables[1])).toBe(true);
    expect(netCDFVariablesCompatible(dataset.variables[0], {
      ...dataset.variables[1],
      dimensionPaths: ["/latitude", "/longitude"],
      shape: [5, 8],
    })).toBe(false);
  });

  it("renders searchable variables, axes, ranges, raw mode, and a stable load action", () => {
    const dataset = fixture();
    const markup = renderToStaticMarkup(createElement(NetCDFWorkspace, {
      dataset,
      loading: false,
      onLoad: () => undefined,
      onCancel: () => undefined,
    }));
    expect(markup).toContain("Search NetCDF variables");
    expect(markup).toContain("X display dimension");
    expect(markup).toContain("Y display dimension");
    expect(markup).toContain("Decoded");
    expect(markup).toContain("Raw");
    expect(markup).toContain("Load slice");
  });
});

function fixture(): NetCDFDataset {
  const dimensions = [
    { name: "time", path: "/time", groupPath: "/", size: 4, unlimited: true },
    { name: "latitude", path: "/latitude", groupPath: "/", size: 5, unlimited: false },
    { name: "longitude", path: "/longitude", groupPath: "/", size: 8, unlimited: false },
  ];
  const variables = [variable("temperature"), variable("humidity")];
  return {
    variant: "NetCDF-4 classic model",
    groups: [{ name: "/", path: "/", dimensions: dimensions.map((item) => item.path), variables: variables.map((item) => item.path), attributes: {} }],
    dimensions,
    variables,
    sourceBytes: 4096,
    sourceByteLimit: 128 * 1024 * 1024,
    sliceCellLimit: 100_000,
    sliceByteLimit: 16 * 1024 * 1024,
    projectionRowLimit: 100_000,
    plotCellLimit: 20_000,
    accessMode: "bounded-buffer",
  };
}

function variable(name: string): NetCDFVariable {
  return {
    name,
    path: `/${name}`,
    groupPath: "/",
    physicalType: "int16",
    dimensions: ["time", "latitude", "longitude"],
    dimensionPaths: ["/time", "/latitude", "/longitude"],
    shape: [4, 5, 8],
    size: 160,
    byteSize: 320,
    chunked: true,
    chunks: [1, 5, 8],
    attributes: { units: "K" },
    units: "K",
    role: "data",
  };
}
