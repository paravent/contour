"""Build one day's Contour puzzle: pick a place, render six stages, check them."""

import base64
import csv
import datetime as dt
import hashlib
import json
import math
from dataclasses import dataclass
from pathlib import Path

from . import countries
from .render import contour_interval, land_levels, render_svg
from .terrain import TileCache, load_view

# Each stage widens the view; later stages add water and borders.
STAGES = [
    {"width_km": 12, "max_lines": 24, "coast": False, "sea": False, "borders": False},
    {"width_km": 30, "max_lines": 22, "coast": False, "sea": False, "borders": False},
    {"width_km": 70, "max_lines": 18, "coast": True, "sea": False, "borders": False},
    {"width_km": 150, "max_lines": 14, "coast": True, "sea": True, "borders": False},
    {"width_km": 300, "max_lines": 10, "coast": True, "sea": True, "borders": True},
    {"width_km": 600, "max_lines": 8, "coast": True, "sea": True, "borders": True},
]
MAX_SVG_BYTES = 150_000
TOLERANCES = (0.7, 1.2, 2.0)


@dataclass
class Place:
    id: str
    name: str
    country: str
    lat: float
    lon: float


class Rejected(Exception):
    """The place failed a quality check; the scheduler moves on to the next one."""


def load_places(path: Path):
    with path.open(newline="") as f:
        return [Place(r["id"], r["name"], r["country"], float(r["lat"]), float(r["lon"])) for r in csv.DictReader(f)]


def puzzle_number(date: dt.date, launch: dt.date) -> int:
    return (date - launch).days + 1


def rotation(places, seed: str):
    """A fixed shuffle of the places, set by the seed."""
    return sorted(places, key=lambda p: hashlib.sha256(f"{seed}:{p.id}".encode()).hexdigest())


def jitter(seed: str, date: dt.date):
    """Where the answer sits in every stage, as an offset from the centre (-0.22..0.22)."""
    h = hashlib.sha256(f"{seed}:jitter:{date.isoformat()}".encode()).digest()
    return (h[0] / 255 - 0.5) * 0.44, (h[1] / 255 - 0.5) * 0.44


def build(place: Place, date: dt.date, number: int, seed: str, out_dir: Path, cache_dir: Path):
    features = countries.load(cache_dir)
    names = {c["code"]: c["name"] for c in countries.country_list(features)}
    rings = countries.border_rings(features)
    tiles = TileCache(cache_dir / "tiles")
    fx, fy = jitter(seed, date)

    files, stages, pin_bounds = {}, [], None
    for i, spec in enumerate(STAGES, start=1):
        w = spec["width_km"]
        # Shift the centre so the answer sits at (0.5 + fx, 0.5 + fy) of the view.
        center_lat = place.lat + fy * w / 111.32
        center_lon = place.lon - fx * w / (111.32 * math.cos(math.radians(place.lat)))
        view = load_view(tiles, center_lon, center_lat, w)

        if i == 1:
            _check_first_stage(view.elevation, place)

        for tol in TOLERANCES:
            svg = render_svg(view, coast=spec["coast"], sea=spec["sea"],
                             borders=rings if spec["borders"] else None,
                             max_lines=spec["max_lines"], tolerance=tol)
            if len(svg.encode()) <= MAX_SVG_BYTES:
                break
        else:
            raise Rejected(f"{place.id}: stage {i} SVG is {len(svg.encode())} bytes")

        files[f"stage{i}.svg"] = svg
        stages.append({"image": f"stage{i}.svg", "widthKm": w, "intervalM": contour_interval(view.elevation, spec["max_lines"])})
        pin_bounds = view.bounds()

    country_name = names[place.country]
    secret = {
        "placeId": place.id,
        "place": place.name,
        "country": place.country,
        "countryName": country_name,
        "lat": place.lat,
        "lon": place.lon,
        "letter": country_name[0].upper(),
    }
    puzzle = {
        "game": "contour",
        "number": number,
        "date": date.isoformat(),
        "stages": stages,
        "pinMap": {"image": f"stage{len(STAGES)}.svg", "bounds": {k: round(v, 6) for k, v in pin_bounds.items()}},
        # Lightly encoded so the answer isn't readable at a glance in dev tools.
        "secret": base64.b64encode(json.dumps(secret).encode()).decode(),
    }

    day_dir = out_dir / date.isoformat()
    day_dir.mkdir(parents=True, exist_ok=True)
    for name, svg in files.items():
        (day_dir / name).write_text(svg)
    (day_dir / "puzzle.json").write_text(json.dumps(puzzle, separators=(",", ":")))
    return puzzle


def _check_first_stage(elevation, place):
    land_share = float((elevation > 0).mean())
    if land_share < 0.3:
        raise Rejected(f"{place.id}: first stage is {land_share:.0%} land")
    interval = contour_interval(elevation, STAGES[0]["max_lines"])
    if not interval or len(land_levels(elevation, interval)) < 4:
        raise Rejected(f"{place.id}: first stage has too little relief")
