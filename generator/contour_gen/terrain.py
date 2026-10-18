"""Fetch elevation for a square map view from the AWS Terrain Tiles dataset.

Tiles are Terrarium-encoded PNGs: elevation_m = R * 256 + G + B / 256 - 32768.
Sea pixels carry bathymetry, so elevation <= 0 is water.
"""

import io
import math
import time
import urllib.request
from dataclasses import dataclass
from pathlib import Path

import numpy as np
from PIL import Image

from . import geo

TILE_URL = "https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png"
MAX_ZOOM = 14
GRID = 320  # cells across the finished elevation grid


@dataclass
class View:
    """A square map view in Web Mercator, plus its elevation grid."""

    zoom: int
    left: float  # global pixel coordinates at `zoom`
    top: float
    side: float
    elevation: np.ndarray  # GRID x GRID, row 0 = north

    def bounds(self):
        west, north = geo.px_to_lonlat(self.left, self.top, self.zoom)
        east, south = geo.px_to_lonlat(self.left + self.side, self.top + self.side, self.zoom)
        return {"west": west, "south": south, "east": east, "north": north}

    def project(self, lon, lat, size):
        """Project a point into SVG coordinates for a `size` x `size` drawing."""
        x, y = geo.lonlat_to_px(lon, lat, self.zoom)
        k = size / self.side
        return (x - self.left) * k, (y - self.top) * k


class TileCache:
    def __init__(self, cache_dir: Path):
        self.cache_dir = cache_dir

    def get(self, z, x, y):
        path = self.cache_dir / str(z) / str(x) / f"{y}.png"
        if not path.exists():
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_bytes(_download(TILE_URL.format(z=z, x=x, y=y)))
        rgb = np.asarray(Image.open(path).convert("RGB"), dtype=np.float32)
        return rgb[..., 0] * 256 + rgb[..., 1] + rgb[..., 2] / 256 - 32768


def _download(url, attempts=4):
    for i in range(attempts):
        try:
            with urllib.request.urlopen(url, timeout=30) as resp:
                return resp.read()
        except OSError:
            if i == attempts - 1:
                raise
            time.sleep(2 ** (i + 1))


def pick_zoom(lat, width_km):
    """Highest zoom whose pixels still fit the view in about 2-3 tiles across."""
    zoom = math.floor(math.log2(geo.EQUATOR_MPP * math.cos(math.radians(lat)) * 640 / (width_km * 1000)))
    return max(1, min(MAX_ZOOM, zoom))


def load_view(cache: TileCache, center_lon, center_lat, width_km) -> View:
    zoom = pick_zoom(center_lat, width_km)
    cx, cy = geo.lonlat_to_px(center_lon, center_lat, zoom)
    side = width_km * 1000 / geo.metres_per_px(center_lat, zoom)
    left, top = cx - side / 2, cy - side / 2

    n_tiles = 2**zoom
    tx0, ty0 = int(left // 256), int(top // 256)
    tx1, ty1 = int((left + side) // 256), int((top + side) // 256)
    mosaic = np.zeros(((ty1 - ty0 + 1) * 256, (tx1 - tx0 + 1) * 256), dtype=np.float32)
    for ty in range(ty0, ty1 + 1):
        for tx in range(tx0, tx1 + 1):
            tile = cache.get(zoom, tx % n_tiles, min(max(ty, 0), n_tiles - 1))
            mosaic[(ty - ty0) * 256:(ty - ty0 + 1) * 256, (tx - tx0) * 256:(tx - tx0 + 1) * 256] = tile

    ox, oy = left - tx0 * 256, top - ty0 * 256
    crop = Image.fromarray(mosaic, mode="F").resize(
        (GRID, GRID), Image.BILINEAR, box=(ox, oy, ox + side, oy + side)
    )
    return View(zoom, left, top, side, _smooth(np.asarray(crop)))


def _smooth(a):
    """A light 3x3 box blur, so contours don't trace single-pixel noise."""
    p = np.pad(a, 1, mode="edge")
    return sum(p[dy:dy + a.shape[0], dx:dx + a.shape[1]] for dy in range(3) for dx in range(3)) / 9
