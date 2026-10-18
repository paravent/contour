"""Build one day's Night Lights puzzle: pick a city, render six night views, check them."""

import base64
import csv
import datetime as dt
import hashlib
import io
import json
import math
from dataclasses import dataclass
from pathlib import Path

import numpy as np
from PIL import Image

from .gibs import TileCache, load_view

GAME = "night-lights"
# Each stage pulls back to show more of the surrounding lights.
STAGE_WIDTHS_KM = [50, 110, 240, 500, 1000, 2000]
SIZE = 512  # px across each stage image
MAX_IMAGE_BYTES = 120_000

# Darkness check on the first view, in luminance (0-255) of the source imagery.
LIT_LEVEL = 80  # a pixel this bright is city light, not moonlit land
MIN_LIT_SHARE = 0.06  # at least this much of the first view is lit
MIN_CORE_LEVEL = 120  # the answer itself must glow (brightest pixel near it)


@dataclass
class City:
    id: str
    name: str
    country: str
    lat: float
    lon: float
    aliases: list


class Rejected(Exception):
    """The city failed a quality check; the scheduler moves on to another one."""


def load_cities(path: Path):
    with path.open(newline="", encoding="utf-8") as f:
        return [
            City(r["id"], r["name"], r["country"], float(r["lat"]), float(r["lon"]),
                 [a for a in r["aliases"].split("|") if a])
            for r in csv.DictReader(f)
        ]


def load_country_names(path: Path):
    """ADM0_A3 code -> English name, from the web app's Natural Earth country list."""
    return {c["code"]: c["name"] for c in json.loads(path.read_text(encoding="utf-8"))}


def puzzle_number(date: dt.date, launch: dt.date) -> int:
    return (date - launch).days + 1


def rotation(cities, seed: str):
    """A fixed shuffle of the cities, set by the seed (independent of Contour's)."""
    return sorted(cities, key=lambda c: hashlib.sha256(f"{seed}:{GAME}:{c.id}".encode()).hexdigest())


def fallback_stride(n: int) -> int:
    """Step between a day's candidates. Far from 1 so a rejected city doesn't hand
    the day to tomorrow's answer; coprime with n so every city is eventually tried."""
    s = max(1, n // 3)
    while math.gcd(s, n) != 1:
        s += 1
    return s


def candidates(order, number: int):
    """The cities to try for puzzle `number`, in order."""
    n, step = len(order), fallback_stride(len(order))
    return [order[(number - 1 + k * step) % n] for k in range(n)]


def jitter(seed: str, date: dt.date):
    """Where the answer sits in every stage, as an offset from the centre (-0.22..0.22)."""
    h = hashlib.sha256(f"{seed}:{GAME}:jitter:{date.isoformat()}".encode()).digest()
    return (h[0] / 255 - 0.5) * 0.44, (h[1] / 255 - 0.5) * 0.44


def luminance(rgb: np.ndarray) -> np.ndarray:
    rgb = rgb.astype(np.float32)
    return 0.2126 * rgb[..., 0] + 0.7152 * rgb[..., 1] + 0.0722 * rgb[..., 2]


def check_lit(lum: np.ndarray, fx: float, fy: float, city_id: str):
    """Reject a first view with too little light, or with the answer itself dark."""
    share = float((lum >= LIT_LEVEL).mean())
    if share < MIN_LIT_SHARE:
        raise Rejected(f"{city_id}: first view is only {share:.1%} lit")
    h, w = lum.shape
    r = max(2, int(0.06 * w))
    cx, cy = int(fx * w), int(fy * h)
    core = lum[max(0, cy - r):cy + r + 1, max(0, cx - r):cx + r + 1]
    if core.size == 0 or float(core.max()) < MIN_CORE_LEVEL:
        raise Rejected(f"{city_id}: the city itself is dark")
    return share


# Gold glow on deep black: luminance runs through these colour stops.
_STOPS = np.array([0.0, 0.18, 0.45, 0.75, 1.0], dtype=np.float32)
_COLOURS = np.array([
    [4, 5, 8],
    [70, 34, 6],
    [196, 116, 22],
    [255, 204, 96],
    [255, 246, 222],
], dtype=np.float32)
BLACK_POINT, WHITE_POINT = 14.0, 235.0
# Faint land (Black Marble's moonlit surface) is kept as a dim blue-grey, so coasts read.
LAND_TINT = np.array([10, 16, 26], dtype=np.float32)


def glow(rgb: np.ndarray) -> np.ndarray:
    """Recolour Black Marble imagery as gold light on black."""
    lum = luminance(rgb)
    t = np.clip((lum - BLACK_POINT) / (WHITE_POINT - BLACK_POINT), 0, 1) ** 0.85
    out = np.stack([np.interp(t, _STOPS, _COLOURS[:, c]) for c in range(3)], axis=-1)
    base = np.clip(lum / BLACK_POINT, 0, 1)[..., None] * LAND_TINT
    return np.clip(np.maximum(out, base), 0, 255).astype(np.uint8)


def encode_jpeg(rgb: np.ndarray, limit=MAX_IMAGE_BYTES) -> bytes:
    """JPEG at the best quality that fits the size limit."""
    img = Image.fromarray(rgb, mode="RGB")
    for quality in (86, 78, 70, 60, 50):
        buf = io.BytesIO()
        img.save(buf, format="JPEG", quality=quality, optimize=True, progressive=True)
        if buf.tell() <= limit:
            return buf.getvalue()
    raise Rejected(f"image is {buf.tell()} bytes even at quality {quality}")


def build(city: City, country_name: str, date: dt.date, number: int, seed: str, out_dir: Path, tiles: TileCache, debug=None):
    fx, fy = jitter(seed, date)

    files, stages, stats = {}, [], {}
    for i, w in enumerate(STAGE_WIDTHS_KM, start=1):
        # Shift the centre so the city sits at (0.5 + fx, 0.5 + fy) of the view.
        center_lat = city.lat + fy * w / 111.32
        center_lon = city.lon - fx * w / (111.32 * math.cos(math.radians(city.lat)))
        view = load_view(tiles, center_lon, center_lat, w, SIZE)

        if i == 1:
            lum = luminance(view.rgb)
            ax, ay = view.locate(city.lon, city.lat)
            stats["lit"] = check_lit(lum, ax, ay, city.id)
            stats["p50"], stats["p90"], stats["p99"] = (round(float(v)) for v in np.percentile(lum, [50, 90, 99]))

        if debug is not None:
            lum = luminance(view.rgb)
            small = np.asarray(Image.fromarray(lum.astype(np.uint8)).resize((48, 24), Image.BOX), dtype=np.float32)
            ramp = " .:-=+*#%@"
            art = "%0A".join("".join(ramp[min(9, int(v / 25.6))] for v in row) for row in small)
            pct = [round(float(v)) for v in np.percentile(lum, [5, 25, 50, 75, 95])]
            rgb_med = [round(float(v)) for v in np.median(view.rgb.reshape(-1, 3), axis=0)]
            debug(f"stage{i} z{view.zoom} lum p5/25/50/75/95 {pct} rgb median {rgb_med}%0A{art}")

        name = f"stage{i}.jpg"
        files[name] = encode_jpeg(glow(view.rgb))
        stages.append({"image": name, "widthKm": w})

    secret = {
        "cityId": city.id,
        "city": city.name,
        "country": city.country,
        "countryName": country_name,
        "lat": city.lat,
        "lon": city.lon,
        "letter": city.name[0].upper(),
        # Where the city sits in every stage, as fractions of width and height, for the result marker.
        "x": round(0.5 + fx, 4),
        "y": round(0.5 + fy, 4),
    }
    puzzle = {
        "game": GAME,
        "number": number,
        "date": date.isoformat(),
        "stages": stages,
        # Lightly encoded so the answer isn't readable at a glance in dev tools.
        "secret": base64.b64encode(json.dumps(secret, ensure_ascii=False).encode()).decode(),
    }

    day_dir = out_dir / date.isoformat()
    day_dir.mkdir(parents=True, exist_ok=True)
    for name, data in files.items():
        (day_dir / name).write_bytes(data)
    (day_dir / "puzzle.json").write_text(json.dumps(puzzle, separators=(",", ":")))
    stats["kb"] = max(len(d) for d in files.values()) // 1024
    return puzzle, stats


def city_list(cities, names):
    """The guessable cities, as the web app consumes them."""
    return sorted(
        ({"id": c.id, "name": c.name, "country": c.country, "countryName": names[c.country],
          "aliases": c.aliases, "lat": c.lat, "lon": c.lon} for c in cities),
        key=lambda c: c["name"],
    )
