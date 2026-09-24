#!/usr/bin/env python3
"""Reproject QGIS GeoJSON (Colombia Urban / col_urban) to WGS84 for mobile maps."""

from __future__ import annotations

import json
import sys
from pathlib import Path

# Allow local pip --target install under .python-pkgs
ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / ".python-pkgs"))

from pyproj import CRS, Transformer  # noqa: E402

SRC_PROJ4 = (
    "+proj=col_urban +lat_0=3.44188333333333 +lon_0=-76.5205625 "
    "+x_0=1061900.18 +y_0=872364.63 +h_0=1000 +ellps=GRS80 "
    "+towgs84=0,0,0,0,0,0,0 +units=m +no_defs"
)

LAYERS = ("edificios", "aristas_red", "nodos", "pasillos", "entradas")


def transform_coords(transformer: Transformer, coords):
    if not coords:
        return coords
    if isinstance(coords[0], (int, float)):
        x, y = coords[0], coords[1]
        lon, lat = transformer.transform(x, y)
        return [lon, lat]
    return [transform_coords(transformer, c) for c in coords]


def convert_file(src: Path, dst: Path, transformer: Transformer) -> None:
    data = json.loads(src.read_text(encoding="utf-8"))
    for feature in data.get("features", []):
        geom = feature.get("geometry")
        if not geom:
            continue
        geom["coordinates"] = transform_coords(transformer, geom["coordinates"])
    data["crs"] = {
        "type": "name",
        "properties": {"name": "urn:ogc:def:crs:OGC:1.3:CRS84"},
    }
    dst.parent.mkdir(parents=True, exist_ok=True)
    # App imports JSON via Metro; write .json (and optional .geojson twin).
    json_dst = dst.with_suffix(".json") if dst.suffix == ".geojson" else dst
    json_dst.write_text(json.dumps(data, ensure_ascii=False), encoding="utf-8")
    print(f"Wrote {json_dst} ({len(data.get('features', []))} features)")


def main() -> None:
    export_dir = ROOT / "export"
    out_dir = ROOT / "mobile" / "assets" / "geojson"
    src_crs = CRS.from_proj4(SRC_PROJ4)
    transformer = Transformer.from_crs(src_crs, "EPSG:4326", always_xy=True)

    for name in LAYERS:
        convert_file(export_dir / f"{name}.geojson", out_dir / f"{name}.geojson", transformer)

    # Sanity check: first building centroid-ish first ring point
    sample = json.loads((out_dir / "edificios.json").read_text(encoding="utf-8"))
    pt = sample["features"][0]["geometry"]["coordinates"][0][0][0]
    print(f"Sample WGS84 point: lon={pt[0]:.6f}, lat={pt[1]:.6f}")


if __name__ == "__main__":
    main()
