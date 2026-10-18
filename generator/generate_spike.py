"""Generate Spike puzzles for a range of days.

    python generator/generate_spike.py --out web/public/puzzles/spike            # yesterday..tomorrow (UTC)
    python generator/generate_spike.py --out /tmp/check --start 2026-10-20 --days 7
    python generator/generate_spike.py --export-pool web/public/data/spike-articles.json
    python generator/generate_spike.py --check-pool                               # audit every article

The seed comes from the CONTOUR_SEED environment variable when it is set, so
the schedule can't be worked out from the public repository. Output includes
GitHub annotation lines (::error:: and ::notice::) so CI summaries show the result.
"""

import argparse
import datetime as dt
import json
import os
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

from spike_gen import wiki  # noqa: E402
from spike_gen.pool import load_pool, pool_json  # noqa: E402
from spike_gen.puzzle import Rejected, build, check_series, load_series, puzzle_number, rotation, window  # noqa: E402

POOL = HERE / "spike_pool.csv"


def generate_day(date, articles, launch, seed, out, cache, **fetchers):
    number = puzzle_number(date, launch)
    order = rotation(articles, seed)
    # Puzzle n gets the nth article in the rotation; one that fails its checks hands
    # the day to the next. Network errors are not rejections: they stop the run, so a
    # flaky fetch can never change which article a day gets.
    for k in range(len(order)):
        article = order[(number - 1 + k) % len(order)]
        try:
            build(article, date, number, out, cache, **fetchers)
            print(f"::notice::spike {date} #{number} ok")
            return article
        except Rejected as e:
            print(f"{date} #{number}: skipped {e}", file=sys.stderr)
    raise RuntimeError(f"{date}: no article passed the checks")


def check_pool(articles, cache):
    """Fetch every article's current chart and report the ones that can't be used."""
    start, end = window(dt.datetime.now(dt.timezone.utc).date())
    bad = []
    for a in articles:
        try:
            info = wiki.fetch_info(a.title)
            if info["title"] != a.title:
                bad.append(f"{a.id}(redirects to {info['title']})")
                continue
            check_series(load_series(a, start, end, cache), a.id)
        except wiki.NotFound:
            bad.append(f"{a.id}(no such page)")
        except Rejected as e:
            bad.append(f"{a.id}({str(e).split(': ', 1)[1]})")
    print(f"::notice::spike pool {len(articles) - len(bad)}/{len(articles)} usable for {start}..{end}")
    # One annotation per chunk: CI shows only a handful of annotations per step.
    chunk = []
    for item in bad:
        chunk.append(item)
        if len("; ".join(chunk)) > 1500:
            print("::warning::spike pool: " + "; ".join(chunk))
            chunk = []
    if chunk:
        print("::warning::spike pool: " + "; ".join(chunk))


def main():
    config = json.loads((HERE / "config.json").read_text())
    today = dt.datetime.now(dt.timezone.utc).date()

    ap = argparse.ArgumentParser()
    ap.add_argument("--out", type=Path)
    ap.add_argument("--start", type=dt.date.fromisoformat, default=today - dt.timedelta(days=1))
    ap.add_argument("--days", type=int, default=3)
    ap.add_argument("--cache", type=Path, default=HERE / ".cache")
    ap.add_argument("--export-pool", type=Path, help="write the type-ahead list for the web app")
    ap.add_argument("--check-pool", action="store_true", help="report articles that can't make a puzzle today")
    args = ap.parse_args()

    articles = load_pool(POOL)
    if args.export_pool:
        rows = ",\n".join(json.dumps(r, ensure_ascii=False) for r in pool_json(articles))
        args.export_pool.write_text(f"[\n{rows}\n]\n")
        return
    if args.check_pool:
        check_pool(articles, args.cache)
        return
    if not args.out:
        ap.error("--out is required")

    launch = dt.date.fromisoformat(config["launch"])
    seed = os.environ.get("CONTOUR_SEED") or config["devSeed"]
    for i in range(args.days):
        date = args.start + dt.timedelta(days=i)
        if date >= launch:
            generate_day(date, articles, launch, seed, args.out, args.cache)


if __name__ == "__main__":
    try:
        main()
    except Exception as e:  # noqa: BLE001 - every failure becomes one readable CI annotation
        print(f"::error::spike generator failed: {type(e).__name__}: {e}")
        sys.exit(1)
