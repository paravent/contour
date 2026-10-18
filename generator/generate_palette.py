"""Generate Palette puzzles for a range of days.

    python generator/generate_palette.py --out web/public/puzzles/palette            # yesterday..tomorrow (UTC)
    python generator/generate_palette.py --out /tmp/check --start 2026-10-20 --days 7
    python generator/generate_palette.py --check-pool                               # look up every pool entry
    python generator/generate_palette.py --guess-list web/public/data/paintings.json

The seed comes from the CONTOUR_SEED environment variable when it is set, so
the schedule can't be worked out from the public repository.

Output lines starting with "::" are GitHub Actions annotations, so results show
on the run's summary page without opening the logs.
"""

import argparse
import datetime as dt
import json
import os
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

from palette_gen import museums  # noqa: E402
from palette_gen.puzzle import Rejected, answer_pool, build, guess_list, load_pool, puzzle_number, rotation  # noqa: E402

POOL = HERE / "paintings.csv"


def annotate(kind, message, title=None):
    """Print a GitHub Actions annotation (kind: notice, warning or error)."""
    message = message.replace("%", "%25").replace("\r", "%0D").replace("\n", "%0A")
    print(f"::{kind}{f' title={title}' if title else ''}::{message}", flush=True)


def generate_day(date, paintings, launch, seed, out, cache):
    number = puzzle_number(date, launch)
    order = rotation(answer_pool(paintings, date), seed)
    # Puzzle n gets the nth painting in the rotation; one that can't be used hands
    # the day to the next. Rejections are permanent facts about a record (missing,
    # not public domain, wrong artist), so every run agrees on the answer.
    for k in range(len(order)):
        painting = order[(number - 1 + k) % len(order)]
        try:
            build(painting, date, number, out, cache)
            # No title: annotations on the daily job are public, and this would name the answer.
            annotate("notice", f"palette {date} #{number} ok")
            return
        except Rejected as e:
            annotate("warning", f"palette {date} #{number}: skipped {e}")
    raise SystemExit(f"palette {date}: no painting in the pool could be used")


def check_pool(paintings):
    """Look up every pool entry; for rows without an object ID, search for candidates."""
    lines, ok = [], 0
    for p in paintings:
        try:
            if p.object_id:
                art = museums.fetch_artwork(p.museum, p.object_id)
                problems = []
                if not art.public_domain:
                    problems.append("not PD")
                if not art.image_url:
                    problems.append("no image")
                if not museums.artist_matches(p.artist, art.artist):
                    problems.append(f"artist {art.artist!r}")
                if art.year and abs(int(art.year) - p.year) > 3:
                    # Museums often date to the end of a range; worth a look, not a failure.
                    lines.append(f"NOTE {p.id} museum year {art.year}, pool says {p.year}")
                overlap = set(museums.plain(p.title).split()) & set(museums.plain(art.title).split())
                if len(overlap) < 0.5 * len(museums.plain(p.title).split()):
                    lines.append(f"TITLE {p.id} {p.museum}:{p.object_id} is [{art.title[:50]}]")
                if problems:
                    lines.append(f"BAD {p.id} {p.museum}:{p.object_id} {'; '.join(problems)} [{art.title[:50]}]")
                else:
                    ok += 1
                continue
            found = []
            for museum in (p.museum, "met" if p.museum == "aic" else "aic"):
                found = museums.search(museum, p.title, p.artist)
                if found:
                    break
            if not found:
                lines.append(f"NONE {p.id}")
                continue
            want = set(museums.plain(p.title).split())
            art = max(found, key=lambda a: len(want & set(museums.plain(a.title).split())))
            pd = "PD" if art.public_domain else "noPD"
            img = "" if art.image_url else " noimg"
            lines.append(f"FIND {p.id} {art.museum}:{art.object_id} {art.year} {pd}{img} [{art.title[:40]}]")
        except (museums.Unusable, museums.FetchError) as e:
            lines.append(f"ERR {p.id} {str(e)[-60:]}")

    # Annotation messages are capped in size and count, so pack the detail into a few.
    for line in lines:
        print(line)
    chunk = 20
    for i in range(0, len(lines), chunk):
        annotate("warning" if i // chunk < 9 else "notice", "\n".join(lines[i:i + chunk]), title=f"palette pool {i // chunk + 1}")
    annotate("notice", f"palette pool: {ok}/{len(paintings)} entries resolve to a public-domain image by the right artist")


def main():
    config = json.loads((HERE / "config.json").read_text())
    today = dt.datetime.now(dt.timezone.utc).date()

    ap = argparse.ArgumentParser()
    ap.add_argument("--out", type=Path)
    ap.add_argument("--start", type=dt.date.fromisoformat, default=today - dt.timedelta(days=1))
    ap.add_argument("--days", type=int, default=3)
    ap.add_argument("--cache", type=Path, default=HERE / ".cache")
    ap.add_argument("--check-pool", action="store_true", help="look up every pool entry at its museum")
    ap.add_argument("--guess-list", type=Path, help="write the game's list of guessable paintings here")
    args = ap.parse_args()

    paintings = load_pool(POOL)
    if args.guess_list:
        args.guess_list.write_text(json.dumps(guess_list(paintings), ensure_ascii=False, separators=(",", ":")) + "\n")
    if args.check_pool:
        check_pool(paintings)
    if not args.out:
        return

    launch = dt.date.fromisoformat(config["launch"])
    seed = os.environ.get("CONTOUR_SEED") or config["devSeed"]
    for i in range(args.days):
        date = args.start + dt.timedelta(days=i)
        if date >= launch:
            generate_day(date, paintings, launch, seed, args.out, args.cache)


if __name__ == "__main__":
    try:
        main()
    except SystemExit as e:
        if e.code not in (None, 0):
            annotate("error", str(e.code))
        raise
    except Exception as e:  # noqa: BLE001 - report anything as an annotation, then fail
        annotate("error", f"palette generator failed: {type(e).__name__}: {e}")
        raise SystemExit(1)
