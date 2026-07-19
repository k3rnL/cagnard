#!/usr/bin/env python3
"""Generate deterministic NetCDF compatibility fixtures for Cagnard."""

from pathlib import Path
import shutil

import netCDF4 as nc
import numpy as np


OUTPUT = Path(__file__).resolve().parents[2] / "examples" / "storage" / "global" / "netcdf"
FILL = np.int16(-32768)


def base_coordinates(dataset: nc.Dataset, time_count: int = 4) -> tuple:
    dataset.Conventions = "CF-1.10"
    dataset.title = "Cagnard deterministic atmosphere fixture"
    dataset.history = "Generated; no private source data"
    dataset.createDimension("time", None)
    dataset.createDimension("latitude", 5)
    dataset.createDimension("longitude", 8)

    time = dataset.createVariable("time", "f8", ("time",))
    time.units = "hours since 2025-01-01 00:00:00"
    time.calendar = "gregorian"
    time.standard_name = "time"
    time.axis = "T"
    time[:] = np.arange(time_count, dtype="f8") * 6

    latitude = dataset.createVariable("latitude", "f4", ("latitude",))
    latitude.units = "degrees_north"
    latitude.standard_name = "latitude"
    latitude.axis = "Y"
    latitude[:] = np.linspace(-60, 60, 5, dtype="f4")

    longitude = dataset.createVariable("longitude", "f4", ("longitude",))
    longitude.units = "degrees_east"
    longitude.standard_name = "longitude"
    longitude.axis = "X"
    longitude[:] = np.linspace(-140, 140, 8, dtype="f4")
    return time, latitude, longitude


def raw_temperature(time_count: int = 4) -> np.ndarray:
    values = np.arange(time_count * 5 * 8, dtype="i2").reshape(time_count, 5, 8)
    values = (values * 3 + 15).astype("i2")
    values[1, 2, 3] = FILL
    return values


def add_packed_temperature(dataset: nc.Dataset, *, compressed: bool = False) -> None:
    kwargs = {"fill_value": FILL}
    if compressed:
        kwargs.update(zlib=True, complevel=4, shuffle=True, chunksizes=(1, 5, 4))
    temperature = dataset.createVariable(
        "air_temperature",
        "i2",
        ("time", "latitude", "longitude"),
        **kwargs,
    )
    temperature.standard_name = "air_temperature"
    temperature.long_name = "Near-surface air temperature"
    temperature.units = "K"
    temperature.scale_factor = np.float32(0.1)
    temperature.add_offset = np.float32(250.0)
    temperature.missing_value = FILL
    temperature.coordinates = "time latitude longitude"
    temperature.set_auto_maskandscale(False)
    temperature[:] = raw_temperature()


def create_atmosphere(path: Path, fmt: str, *, compressed: bool = False) -> None:
    with nc.Dataset(path, "w", format=fmt) as dataset:
        base_coordinates(dataset)
        add_packed_temperature(dataset, compressed=compressed)
        station = dataset.createVariable("station_name", "S1", ("latitude", "longitude"))
        station.long_name = "Single-character station class"
        station[:] = np.full((5, 8), b"A", dtype="S1")


def create_cdf5(path: Path) -> None:
    with nc.Dataset(path, "w", format="NETCDF3_64BIT_DATA") as dataset:
        dataset.createDimension("record", None)
        record = dataset.createVariable("record", "i8", ("record",))
        record.long_name = "64-bit CDF-5 record identifier"
        record[:] = np.array([1, 2, 2**40], dtype="i8")
        value = dataset.createVariable("value", "f8", ("record",))
        value[:] = np.array([1.5, np.nan, 3.5], dtype="f8")


def create_enhanced(path: Path) -> None:
    with nc.Dataset(path, "w", format="NETCDF4") as dataset:
        base_coordinates(dataset)
        add_packed_temperature(dataset, compressed=True)
        forecast = dataset.createGroup("forecast")
        forecast.description = "Nested forecast group"
        forecast.createDimension("member", 3)
        member = forecast.createVariable("member", "i4", ("member",))
        member.long_name = "Ensemble member"
        member[:] = np.arange(3, dtype="i4")
        probability = forecast.createVariable(
            "rain_probability",
            "f4",
            ("member", "latitude", "longitude"),
            zlib=True,
            complevel=2,
            chunksizes=(1, 5, 4),
        )
        probability.units = "1"
        probability.long_name = "Probability of rain"
        probability[:] = (
            np.arange(3 * 5 * 8, dtype="f4").reshape(3, 5, 8) % 100
        ) / 100
        labels = forecast.createVariable("member_label", str, ("member",))
        labels[:] = np.array(["control", "warm", "cool"], dtype=object)


def create_unsupported(path: Path) -> None:
    compound = np.dtype([("real", "<f4"), ("imag", "<f4")])
    with nc.Dataset(path, "w", format="NETCDF4") as dataset:
        dataset.createDimension("sample", 2)
        complex_type = dataset.createCompoundType(compound, "complex_number")
        values = dataset.createVariable("signal", complex_type, ("sample",))
        values[:] = np.array([(1.0, 2.0), (3.0, 4.0)], dtype=compound)


def create_large(path: Path) -> None:
    with nc.Dataset(path, "w", format="NETCDF4_CLASSIC") as dataset:
        dataset.createDimension("time", 8)
        dataset.createDimension("y", 256)
        dataset.createDimension("x", 512)
        data = dataset.createVariable(
            "reflectivity",
            "f4",
            ("time", "y", "x"),
            chunksizes=(1, 64, 128),
            zlib=False,
        )
        data.units = "dBZ"
        data.long_name = "Deterministic large range and cancellation fixture"
        plane = np.arange(256 * 512, dtype="f4").reshape(256, 512)
        for index in range(8):
            data[index, :, :] = (plane % 73) + index


def write_readme() -> None:
    (OUTPUT / "README.md").write_text(
        """# NetCDF Fixtures

Generated by `frontend/scripts/generate-netcdf-fixtures.py` using the pinned requirements beside that script. The corpus contains no private data.

The source values and structures are deterministic. `unsupported-compound.nc4` is the sole byte-level exception: NetCDF-C/HDF5 records creation times for its committed compound datatype, so that file's checksum can vary between runs without changing its tested semantics.

| File | Purpose |
| --- | --- |
| `atmosphere-classic.nc` | CDF-1, unlimited time, CF coordinates, packed values and fill data |
| `atmosphere-64bit-offset.nc` | CDF-2 equivalent semantic data |
| `records-cdf5.nc` | CDF-5 and 64-bit integers |
| `atmosphere-netcdf4-classic.nc4` | NetCDF-4 classic model, chunking and DEFLATE |
| `atmosphere-groups.nc4` | Enhanced model, groups, inherited dimensions, strings and compression |
| `unsupported-compound.nc4` | Deliberately unsupported compound type |
| `reflectivity-large.nc4` | Modest 4 MiB-class bounded/cancellation fixture |
| `truncated-classic.nc` | Deliberately truncated CDF input |
| `malformed-cdf.nc` | CDF signature followed by invalid content |
| `generic-hdf5-candidate.nc4` | HDF5-shaped candidate without the NetCDF semantic marker |

The NetCDF-C Wasm adapter is expected to read the first six semantic variants, reject or degrade unsupported/malformed cases safely, and enforce Cagnard's browser buffer and slice ceilings before materialization.
""",
        encoding="utf-8",
    )


def main() -> None:
    if OUTPUT.exists():
        shutil.rmtree(OUTPUT)
    OUTPUT.mkdir(parents=True)
    create_atmosphere(OUTPUT / "atmosphere-classic.nc", "NETCDF3_CLASSIC")
    create_atmosphere(OUTPUT / "atmosphere-64bit-offset.nc", "NETCDF3_64BIT_OFFSET")
    create_cdf5(OUTPUT / "records-cdf5.nc")
    create_atmosphere(
        OUTPUT / "atmosphere-netcdf4-classic.nc4",
        "NETCDF4_CLASSIC",
        compressed=True,
    )
    create_enhanced(OUTPUT / "atmosphere-groups.nc4")
    create_unsupported(OUTPUT / "unsupported-compound.nc4")
    create_large(OUTPUT / "reflectivity-large.nc4")

    classic = (OUTPUT / "atmosphere-classic.nc").read_bytes()
    (OUTPUT / "truncated-classic.nc").write_bytes(classic[: max(32, len(classic) // 3)])
    (OUTPUT / "malformed-cdf.nc").write_bytes(b"CDF\x01" + b"not-a-valid-netcdf" * 8)

    generic = bytearray((OUTPUT / "atmosphere-netcdf4-classic.nc4").read_bytes())
    marker = generic.find(b"_NCProperties")
    if marker < 0:
        raise RuntimeError("Generated NetCDF-4 fixture has no _NCProperties marker")
    generic[marker : marker + len(b"_NCProperties")] = b"_XXProperties"
    (OUTPUT / "generic-hdf5-candidate.nc4").write_bytes(generic)
    write_readme()


if __name__ == "__main__":
    main()
