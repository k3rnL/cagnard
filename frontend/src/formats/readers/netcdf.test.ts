import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import type { NetCDFDataset, NetCDFVariable } from "../models";
import {
  decodeNetCDFValue,
  detectNetCDFSignature,
  prepareSliceRequest,
} from "./netcdf";

describe("NetCDF reader facade", () => {
  it("distinguishes CDF variants, NetCDF-4 candidates, and unrelated binary files", () => {
    expect(detectNetCDFSignature(new Uint8Array([0x43, 0x44, 0x46, 1])))
      .toBe("NetCDF classic (CDF-1)");
    expect(detectNetCDFSignature(new Uint8Array([0x43, 0x44, 0x46, 2])))
      .toBe("NetCDF 64-bit offset (CDF-2)");
    expect(detectNetCDFSignature(new Uint8Array([0x43, 0x44, 0x46, 5])))
      .toBe("NetCDF 64-bit data (CDF-5)");
    expect(detectNetCDFSignature(new Uint8Array([0x89, 0x48, 0x44, 0x46, 0x0d, 0x0a, 0x1a, 0x0a])))
      .toBe("NetCDF-4 / HDF5 candidate");
    expect(detectNetCDFSignature(new Uint8Array([1, 2, 3, 4]))).toBeUndefined();
  });

  it("recognizes every deterministic NetCDF fixture container", () => {
    const fixtures = [
      ["atmosphere-classic.nc", "NetCDF classic (CDF-1)"],
      ["atmosphere-64bit-offset.nc", "NetCDF 64-bit offset (CDF-2)"],
      ["records-cdf5.nc", "NetCDF 64-bit data (CDF-5)"],
      ["atmosphere-netcdf4-classic.nc4", "NetCDF-4 / HDF5 candidate"],
      ["atmosphere-groups.nc4", "NetCDF-4 / HDF5 candidate"],
      ["reflectivity-large.nc4", "NetCDF-4 / HDF5 candidate"],
      ["generic-hdf5-candidate.nc4", "NetCDF-4 / HDF5 candidate"],
      ["malformed-cdf.nc", "NetCDF classic (CDF-1)"],
      ["truncated-classic.nc", "NetCDF classic (CDF-1)"],
      ["unsupported-compound.nc4", "NetCDF-4 / HDF5 candidate"],
    ] as const;

    fixtures.forEach(([name, expected]) => {
      const bytes = readFileSync(
        new URL(`../../../../examples/storage/global/netcdf/${name}`, import.meta.url),
      );
      expect(detectNetCDFSignature(bytes), name).toBe(expected);
    });
  });

  it("validates bounded compatible projections before reading", () => {
    const request = {
      variablePaths: ["/temperature", "/humidity"],
      selections: [
        { dimensionPath: "/time", start: 0, count: 2 },
        { dimensionPath: "/x", start: 1, count: 3 },
      ],
      xDimensionPath: "/x",
      yDimensionPath: "/time",
      decoded: true,
    };
    const prepared = prepareSliceRequest(catalog(), request);
    expect(prepared.variables.map((variable) => variable.name)).toEqual(["temperature", "humidity"]);
    expect(prepared.xDimension?.name).toBe("x");
    expect(prepared.yDimension?.name).toBe("time");
  });

  it("rejects incompatible variables, invalid ranges, and oversized projections", () => {
    const incompatible = variable("profile", ["/x"], [4]);
    const data = catalog([incompatible]);
    expect(() => prepareSliceRequest(data, {
      variablePaths: ["/temperature", "/profile"],
      selections: [
        { dimensionPath: "/time", start: 0, count: 1 },
        { dimensionPath: "/x", start: 0, count: 1 },
      ],
      decoded: true,
    })).toThrow(/same dimensions/i);
    expect(() => prepareSliceRequest(catalog(), {
      variablePaths: ["/temperature"],
      selections: [
        { dimensionPath: "/time", start: 4, count: 1 },
        { dimensionPath: "/x", start: 0, count: 1 },
      ],
      decoded: true,
    })).toThrow(/outside/i);
    expect(() => prepareSliceRequest({ ...catalog(), sliceCellLimit: 2 }, {
      variablePaths: ["/temperature"],
      selections: [
        { dimensionPath: "/time", start: 0, count: 2 },
        { dimensionPath: "/x", start: 0, count: 2 },
      ],
      decoded: true,
    })).toThrow(/narrow/i);
  });

  it("applies fill handling before scale and offset while retaining raw mode", () => {
    const packed = {
      ...variable("temperature"),
      attributes: {
        _FillValue: -32768,
        missing_value: [-9999, -8888],
        scale_factor: 0.1,
        add_offset: 250,
      },
    };
    expect(decodeNetCDFValue(-32768, packed, true)).toBeNull();
    expect(decodeNetCDFValue(-9999, packed, true)).toBeNull();
    expect(decodeNetCDFValue(15, packed, true)).toBeCloseTo(251.5);
    expect(decodeNetCDFValue(15, packed, false)).toBe(15);
  });
});

function variable(
  name: string,
  dimensionPaths = ["/time", "/x"],
  shape = [4, 4],
): NetCDFVariable {
  return {
    name,
    path: `/${name}`,
    groupPath: "/",
    physicalType: "int16",
    dimensions: dimensionPaths.map((path) => path.slice(1)),
    dimensionPaths,
    shape,
    size: shape.reduce((total, size) => total * size, 1),
    byteSize: shape.reduce((total, size) => total * size, 2),
    chunked: false,
    attributes: {},
    role: "data",
  };
}

function catalog(additional: NetCDFVariable[] = []): NetCDFDataset {
  const variables = [variable("temperature"), variable("humidity"), ...additional];
  return {
    variant: "NetCDF classic (CDF-1)",
    groups: [{ name: "/", path: "/", dimensions: ["/time", "/x"], variables: variables.map((item) => item.path), attributes: {} }],
    dimensions: [
      { name: "time", path: "/time", groupPath: "/", size: 4, unlimited: true },
      { name: "x", path: "/x", groupPath: "/", size: 4, unlimited: false },
    ],
    variables,
    sourceBytes: 1024,
    sourceByteLimit: 128 * 1024 * 1024,
    sliceCellLimit: 100_000,
    sliceByteLimit: 16 * 1024 * 1024,
    projectionRowLimit: 100_000,
    plotCellLimit: 20_000,
    accessMode: "bounded-buffer",
  };
}
