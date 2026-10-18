"""Generate Contour puzzles for a range of days.

    python generator/generate.py --out web/public/puzzles/contour            # yesterday..tomorrow (UTC)
    python generator/generate.py --out /tmp/check --start 2026-10-20 --days 7

The seed comes from the CONTOUR_SEED environment variable when it is set, so
the schedule can't be worked out from the public repository.
"""

import argparse
import datetime as dt
import json
import os
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

from contour_gen.puzzle import Rejected, build, load_places, puzzle_number, rotation  # noqa: E402


def generate_day(date, places, launch, seed, out, cache):
    number = puzzle_number(date, launch)
    order = rotation(places, seed)
    # Puzzle n gets the nth place in the rotation; a place that fails its checks
    # hands the day to the next one. Checks are deterministic, so every run agrees.
    for k in range(len(order)):
        place = order[(number - 1 + k) % len(order)]
        try:
            build(place, date, number, seed, out, cache)
            print(f"{date} #{number}: ok")
            return
        except Rejected as e:
            print(f"{date} #{number}: skipped {e}", file=sys.stderr)
    raise SystemExit(f"{date}: no place passed the checks")


def main():
    config = json.loads((HERE / "config.json").read_text())
    today = dt.datetime.now(dt.timezone.utc).date()

    ap = argparse.ArgumentParser()
    ap.add_argument("--out", type=Path, required=True)
    ap.add_argument("--start", type=dt.date.fromisoformat, default=today - dt.timedelta(days=1))
    ap.add_argument("--days", type=int, default=3)
    ap.add_argument("--cache", type=Path, default=HERE / ".cache")
    args = ap.parse_args()

    launch = dt.date.fromisoformat(config["launch"])
    seed = os.environ.get("CONTOUR_SEED") or config["devSeed"]
    places = load_places(HERE / "places.csv")

    for i in range(args.days):
        date = args.start + dt.timedelta(days=i)
        if date >= launch:
            generate_day(date, places, launch, seed, args.out, args.cache)


if __name__ == "__main__":
    main()
