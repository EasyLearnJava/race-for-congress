"""Equal-area House district map (The Downballot's hexmap v3.2) as SVG paths."""

from __future__ import annotations

import json
import math
import zipfile

import shapefile

from common import CLEAN, RAW, fetch, record_source
from states import SEATS_BY_POSTAL, race_id

DISTRICTS_FILE = "18acMZLOjpQlyj_c-2q0QktmcsjM6Obrk"  # Congressional District Hexmap v3.2 (2026), CDs
STATES_FILE = "10thkt1J_lpHSZvqLmOOmIbclqq1ct9zv"  # state outlines (unchanged since v3.0)
ATTRIBUTION = {
    "name": "Congressional District Hexmap v3.2 (2026) by Daniel Donner for The Downballot",
    "url": "https://the-db.co/maps",
    "license": "CC BY 4.0",
}
WIDTH = 1000


def _shapes(file_id: str, name: str, refresh: bool) -> shapefile.Reader:
    archive = fetch("https://drive.google.com/uc", RAW / "hexmap" / f"{name}.zip", refresh=refresh,
                    params={"export": "download", "id": file_id})
    folder = RAW / "hexmap" / name
    with zipfile.ZipFile(archive) as z:
        z.extractall(folder)
    shp = next(folder.rglob("*.shp"))
    return shapefile.Reader(str(shp.with_suffix("")))


def _mercator(lon: float, lat: float) -> tuple[float, float]:
    # The map is drawn to look right in Web Mercator; y grows downward as in SVG.
    return math.radians(lon), -math.log(math.tan(math.pi / 4 + math.radians(lat) / 2))


def _centroid(ring: list[tuple[float, float]]) -> tuple[float, float, float]:
    area = cx = cy = 0.0
    for (x0, y0), (x1, y1) in zip(ring, ring[1:] + ring[:1]):
        cross = x0 * y1 - x1 * y0
        area += cross
        cx += (x0 + x1) * cross
        cy += (y0 + y1) * cross
    area /= 2
    if abs(area) < 1e-9:  # degenerate sliver: fall back to the average point
        return sum(x for x, _ in ring) / len(ring), sum(y for _, y in ring) / len(ring), 0.0
    return cx / (6 * area), cy / (6 * area), abs(area)


def build_hexmap(refresh: bool = False) -> dict:
    districts = _shapes(DISTRICTS_FILE, "cds", refresh)
    states = _shapes(STATES_FILE, "states", refresh)
    record_source("downballot_hexmap", **ATTRIBUTION)

    def rings(shape) -> list[list[tuple[float, float]]]:
        bounds = list(shape.parts) + [len(shape.points)]
        return [[_mercator(*p) for p in shape.points[a:b]] for a, b in zip(bounds, bounds[1:])]

    projected = [rings(s) for s in districts.shapes()]
    xs = [x for shape in projected for ring in shape for x, _ in ring]
    ys = [y for shape in projected for ring in shape for _, y in ring]
    x0, y0, scale = min(xs), min(ys), WIDTH / (max(xs) - min(xs))

    def place(ring) -> list[tuple[float, float]]:
        return [((x - x0) * scale, (y - y0) * scale) for x, y in ring]

    def feature(shape_rings) -> dict:
        placed = [place(r) for r in shape_rings]
        path = "".join("M" + "L".join(f"{x:.1f} {y:.1f}" for x, y in r) + "Z" for r in placed)
        cx, cy, _ = max((_centroid(r) for r in placed), key=lambda c: c[2])
        return {"d": path, "cx": round(cx, 1), "cy": round(cy, 1)}

    out_districts = []
    for record, shape_rings in zip(districts.records(), projected):
        postal = record["STATEAB"]
        number = int(record["GEOID"][2:])
        out_districts.append({"id": race_id(postal, number), "state": postal, **feature(shape_rings)})

    out_states = [
        {"state": record["STATEAB"], **feature(rings(shape))}
        for record, shape in zip(states.records(), states.shapes())
    ]

    seen = {d["id"] for d in out_districts}
    expected = {race_id(p, n) for p, seats in SEATS_BY_POSTAL.items() for n in range(1, seats + 1)}
    if seen != expected:
        raise ValueError(f"Hexmap districts differ from 435 seats: missing {sorted(expected - seen)}, extra {sorted(seen - expected)}")

    height = (max(ys) - y0) * scale
    hexmap = {
        "attribution": ATTRIBUTION,
        "viewBox": [0, 0, WIDTH, round(height, 1)],
        "districts": sorted(out_districts, key=lambda d: d["id"]),
        "states": sorted(out_states, key=lambda s: s["state"]),
    }
    CLEAN.mkdir(parents=True, exist_ok=True)
    (CLEAN / "hexmap_2026.json").write_text(json.dumps(hexmap, separators=(",", ":")), "utf-8")
    return hexmap
