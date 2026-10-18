"""Generate Night Lights puzzles for a range of days.

    python generator/generate_night_lights.py --out web/public/puzzles/night-lights   # yesterday..tomorrow (UTC)
    python generator/generate_night_lights.py --out /tmp/check --start 2026-10-20 --days 7
    python generator/generate_night_lights.py --export-cities web/public/data/cities.json

Shares Contour's seed (CONTOUR_SEED, else devSeed) and launch date. Prints GitHub
annotations (::notice:: / ::error::) so results show on the Actions run summary.
"""

import argparse
import datetime as dt
import json
import os
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

from night_lights.gibs import TileCache  # noqa: E402
from night_lights.puzzle import (  # noqa: E402
    Rejected, build, candidates, city_list, load_cities, load_country_names, puzzle_number, rotation,
)

CITIES = HERE / "cities.csv"
COUNTRIES = HERE.parent / "web" / "public" / "data" / "countries.json"


def generate_day(date, cities, names, launch, seed, out, tiles):
    number = puzzle_number(date, launch)
    # Puzzle n gets the nth city in the rotation; a city that fails its checks hands
    # the day to another one. Checks are deterministic, so every run agrees.
    for city in candidates(rotation(cities, seed), number):
        try:
            debug = (lambda m: print(f"::notice::{city.id} {m}")) if os.environ.get("NIGHT_LIGHTS_DEBUG") else None
            _, stats = build(city, names[city.country], date, number, seed, out, tiles, debug)
        except Rejected as e:
            print(f"{date} #{number}: skipped {e}", file=sys.stderr)
            continue
        # No city name here: annotations on the daily job are public.
        print(f"::notice::night-lights {date} #{number} ok "
              f"(lit {stats['lit']:.0%}, lum p50/p90/p99 {stats['p50']}/{stats['p90']}/{stats['p99']}, "
              f"largest {stats['kb']} KB)")
        return
    raise RuntimeError(f"{date}: no city passed the checks")


def main():
    config = json.loads((HERE / "config.json").read_text())
    today = dt.datetime.now(dt.timezone.utc).date()

    ap = argparse.ArgumentParser()
    ap.add_argument("--out", type=Path)
    ap.add_argument("--start", type=dt.date.fromisoformat, default=today - dt.timedelta(days=1))
    ap.add_argument("--days", type=int, default=3)
    ap.add_argument("--cache", type=Path, default=HERE / ".cache" / "night-lights")
    ap.add_argument("--export-cities", type=Path, help="write the guessable city list for the web app")
    args = ap.parse_args()

    cities = load_cities(CITIES)
    names = load_country_names(COUNTRIES)

    if args.export_cities:
        args.export_cities.write_text(json.dumps(city_list(cities, names), ensure_ascii=False, separators=(",", ":")) + "\n")
        print(f"wrote {len(cities)} cities to {args.export_cities}")
        return
    if not args.out:
        ap.error("--out is required")

    launch = dt.date.fromisoformat(config["launch"])
    seed = os.environ.get("CONTOUR_SEED") or config["devSeed"]
    tiles = TileCache(args.cache)
    for i in range(args.days):
        date = args.start + dt.timedelta(days=i)
        if date >= launch:
            generate_day(date, cities, names, launch, seed, args.out, tiles)


if __name__ == "__main__":
    try:
        main()
    except SystemExit:
        raise
    except BaseException as e:  # noqa: BLE001 - surface every failure as a CI annotation
        print(f"::error::night-lights generator failed: {type(e).__name__}: {e}".replace("\n", " "))
        raise SystemExit(1)
