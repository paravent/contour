"""Country names, label points and borders from Natural Earth (public domain)."""

import json
import urllib.request
from functools import lru_cache
from pathlib import Path

NE_URL = (
    "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/"
    "master/geojson/ne_50m_admin_0_countries.geojson"
)


@lru_cache(maxsize=1)
def load(cache_dir: Path):
    path = cache_dir / "ne_50m_admin_0_countries.geojson"
    if not path.exists():
        path.parent.mkdir(parents=True, exist_ok=True)
        with urllib.request.urlopen(NE_URL, timeout=60) as resp:
            path.write_bytes(resp.read())
    return json.loads(path.read_text())["features"]


def country_list(features):
    """The guessable countries, as the web app consumes them."""
    out = []
    for f in features:
        p = f["properties"]
        names = {p["NAME"], p["NAME_LONG"], p["ADMIN"], p["NAME_EN"], p["FORMAL_EN"] or ""}
        names.discard("")
        out.append({
            "code": p["ADM0_A3"],
            "name": p["NAME_EN"] or p["NAME"],
            "aliases": sorted(n for n in names if n != (p["NAME_EN"] or p["NAME"])),
            "lat": round(p["LABEL_Y"], 3),
            "lon": round(p["LABEL_X"], 3),
        })
    return sorted(out, key=lambda c: c["name"])


def continents(features):
    """Country code -> continent name, for the late-game clue."""
    out = {}
    for f in features:
        p = f["properties"]
        name = p.get("CONTINENT") or ""
        # Natural Earth files a few island states under "Seven seas (open ocean)".
        out[p["ADM0_A3"]] = "" if name.startswith("Seven seas") else name
    return out


def border_rings(features):
    """Every outer and inner ring of every country, as lists of (lon, lat)."""
    rings = []
    for f in features:
        g = f["geometry"]
        polys = g["coordinates"] if g["type"] == "MultiPolygon" else [g["coordinates"]]
        for poly in polys:
            rings.extend(poly)
    return rings


if __name__ == "__main__":
    import argparse

    ap = argparse.ArgumentParser(description="Write the countries list the web app uses.")
    ap.add_argument("--cache", type=Path, default=Path(__file__).resolve().parents[1] / ".cache")
    ap.add_argument("--out", type=Path, required=True)
    args = ap.parse_args()
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(country_list(load(args.cache)), ensure_ascii=False, separators=(",", ":")))
