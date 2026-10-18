"""Fetch NASA Black Marble night-lights imagery from the GIBS WMTS service.

GIBS serves the layer in Web Mercator (EPSG:3857) on the GoogleMapsCompatible_Level8
tile matrix set: 256 px tiles, zoom 0 to 8. The REST template puts the row before
the column, i.e. .../{TileMatrix}/{TileRow}/{TileCol}.png = .../{z}/{y}/{x}.png.
See https://nasa-gibs.github.io/gibs-api-docs/access-basics/ and the capabilities
document at https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/1.0.0/WMTSCapabilities.xml
"""

import io
import math
import time
import urllib.request
from dataclasses import dataclass
from pathlib import Path

import numpy as np
from PIL import Image

from contour_gen import geo

LAYER = "VIIRS_Black_Marble"
TIME = "2016-01-01"  # the most recent annual composite
TILE_URL = (
    "https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/"
    f"{LAYER}/default/{TIME}/GoogleMapsCompatible_Level8/{{z}}/{{y}}/{{x}}.png"
)
MAX_ZOOM = 8
TILE = geo.TILE_SIZE


@dataclass
class View:
    """A square map view in Web Mercator, resampled to an RGB image."""

    zoom: int
    left: float  # global pixel coordinates at `zoom`
    top: float
    side: float
    rgb: np.ndarray  # size x size x 3, uint8, row 0 = north

    def bounds(self):
        west, north = geo.px_to_lonlat(self.left, self.top, self.zoom)
        east, south = geo.px_to_lonlat(self.left + self.side, self.top + self.side, self.zoom)
        return {"west": west, "south": south, "east": east, "north": north}

    def locate(self, lon, lat):
        """Where a point falls in the image, as fractions of its width and height."""
        x, y = geo.lonlat_to_px(lon, lat, self.zoom)
        return (x - self.left) / self.side, (y - self.top) / self.side


def _download(url, attempts=4):
    req = urllib.request.Request(url, headers={"User-Agent": "contour-night-lights/1.0"})
    for i in range(attempts):
        try:
            with urllib.request.urlopen(req, timeout=30) as resp:
                return resp.read()
        except OSError:
            if i == attempts - 1:
                raise
            time.sleep(2 ** (i + 1))


class TileCache:
    """Tiles on disk under cache_dir/z/x/y.png; `fetch` is swappable for tests."""

    def __init__(self, cache_dir: Path, fetch=_download):
        self.cache_dir = cache_dir
        self.fetch = fetch

    def get(self, z, x, y):
        path = self.cache_dir / str(z) / str(x) / f"{y}.png"
        if not path.exists():
            data = self.fetch(TILE_URL.format(z=z, x=x, y=y))
            Image.open(io.BytesIO(data)).verify()  # an error page is not a tile
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_bytes(data)
        return np.asarray(Image.open(path).convert("RGB"), dtype=np.uint8)


def pick_zoom(lat, width_km, size):
    """Lowest zoom with at least `size` source pixels across the view (capped at the layer's max)."""
    need = width_km * 1000 / (size * geo.EQUATOR_MPP * math.cos(math.radians(lat)))
    return max(0, min(MAX_ZOOM, math.ceil(math.log2(1 / need)))) if need < 1 else 0


def load_view(cache: TileCache, center_lon, center_lat, width_km, size) -> View:
    zoom = pick_zoom(center_lat, width_km, size)
    cx, cy = geo.lonlat_to_px(center_lon, center_lat, zoom)
    side = width_km * 1000 / geo.metres_per_px(center_lat, zoom)
    left, top = cx - side / 2, cy - side / 2

    n_tiles = 2**zoom
    tx0, ty0 = math.floor(left / TILE), math.floor(top / TILE)
    tx1, ty1 = math.floor((left + side) / TILE), math.floor((top + side) / TILE)
    mosaic = np.zeros(((ty1 - ty0 + 1) * TILE, (tx1 - tx0 + 1) * TILE, 3), dtype=np.uint8)
    for ty in range(ty0, ty1 + 1):
        for tx in range(tx0, tx1 + 1):
            # Wrap across the antimeridian; clamp past the poles (never reached by the city pool).
            tile = cache.get(zoom, tx % n_tiles, min(max(ty, 0), n_tiles - 1))
            mosaic[(ty - ty0) * TILE:(ty - ty0 + 1) * TILE, (tx - tx0) * TILE:(tx - tx0 + 1) * TILE] = tile

    ox, oy = left - tx0 * TILE, top - ty0 * TILE
    crop = Image.fromarray(mosaic, mode="RGB").resize(
        (size, size), Image.LANCZOS, box=(ox, oy, ox + side, oy + side)
    )
    return View(zoom, left, top, side, np.asarray(crop))
