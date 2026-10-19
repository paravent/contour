"""Generate Logos puzzles for a range of days.

    python generator/generate_logos.py --out web/public/puzzles/logos            # yesterday..tomorrow (UTC)
    python generator/generate_logos.py --out /tmp/check --start 2026-10-20 --days 7
    python generator/generate_logos.py --check-pool                             # look up every brand
    python generator/generate_logos.py --guess-list web/public/data/brands.json

The seed comes from the CONTOUR_SEED environment variable when it is set, so
the schedule can't be worked out from the public repository.

Output lines starting with "::" are GitHub Actions annotations, so results show
on the run's summary page without opening the logs. The daily job's annotations
are public, so they never name a day's brand.
"""

import argparse
import datetime as dt
import json
import os
import sys
import traceback
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

from logos_gen import commons  # noqa: E402
from logos_gen.puzzle import Rejected, answer_pool, build, guess_list, load_pool, puzzle_number, rotation  # noqa: E402

POOL = HERE / "brands.csv"


def annotate(kind, message, title=None):
    """Print a GitHub Actions annotation (kind: notice, warning or error)."""
    message = message.replace("%", "%25").replace("\r", "%0D").replace("\n", "%0A")
    print(f"::{kind}{f' title={title}' if title else ''}::{message}", flush=True)


def generate_day(date, brands, launch, seed, out, cache):
    number = puzzle_number(date, launch)
    order = rotation(answer_pool(brands), seed)
    if not order:
        raise SystemExit(f"logos {date}: the pool has no answerable brands")
    # Puzzle n gets the nth brand in the rotation; one that can't be used hands the day
    # to the next. Rejections are permanent facts about a file (missing, not public
    # domain, unusable image), so every run agrees on the answer.
    for k in range(len(order)):
        brand = order[(number - 1 + k) % len(order)]
        try:
            build(brand, date, number, out, cache)
            # No brand name: annotations on the daily job are public.
            annotate("notice", f"logos {date} #{number} ok")
            return
        except Rejected:
            # The reason would name the brand, so it stays out of the annotation.
            annotate("warning", f"logos {date} #{number}: skipped a brand")
    raise SystemExit(f"logos {date}: no brand in the pool could be used")


def check_pool(brands, cache):
    """Look every brand up on Wikidata and its logo on Commons; report anything that disagrees with the pool.

    Each line starts with OK (in use and checked), CHECK (in use, but something disagrees),
    NEW (no logo file chosen yet, with Wikidata's logo and icon and their licences) or NOITEM.
    """
    from logos_gen import puzzle

    entities = commons.entities_for(brands)
    country_names = commons.labels([q for e in entities.values() if e for q in e.countries])
    wanted = []
    for b in brands:
        e = entities[b.id]
        wanted += ([b.file] if b.file else []) + list(e.logos[:1] if e else []) + list(e.icons[:1] if e else [])
    infos = commons.file_info(wanted)

    def describe(name):
        i = infos[name]
        if i.missing:
            return f"{name} MISSING"
        return f"{name} {'PD' if i.public_domain else 'X:' + (i.licence_code or i.licence)} {i.width}x{i.height}"

    lines, usable = [], 0
    for b in brands:
        e = entities[b.id]
        if not e:
            lines.append(f"NOITEM {b.id} [{b.wiki}]")
            continue
        notes = [] if b.qid else [f"qid {e.qid}"]
        if e.inception is not None and abs(e.inception - b.founded) > 1:
            notes.append(f"year {e.inception}")
        names = [country_names.get(q, q) for q in e.countries]
        if names and b.country not in names:
            notes.append(f"country {'/'.join(names[:3])}")
        if b.file:
            try:
                puzzle.prepare(b, puzzle.fetch(b, cache)[1])
                usable += 1
            except Rejected as err:
                notes.append(f"REJECTED {str(err)[len(b.id) + 2:]}")
            tag = "CHECK" if notes else "OK"
            lines.append(f"{tag} {b.id}{' wordmark' if b.wordmark else ''} {'; '.join(notes)}".rstrip())
        else:
            found = [describe(n) for n in (e.logos[:1] + e.icons[:1])]
            lines.append(f"NEW {b.id} {' | '.join(found) or 'no logo'} {'; '.join(notes)}".rstrip())

    for line in lines:
        print(line)
    # Annotations are capped at 4 KB and 10 of each kind per step; the summary goes first.
    answerable = len(answer_pool(brands))
    annotate("notice", f"logos pool: {len(brands)} brands, {answerable} answerable, {usable} logos pass the licence and image checks")
    chunks, chunk = [], []
    for line in lines:
        if sum(len(x) + 1 for x in chunk) + len(line) > 3900:
            chunks.append(chunk)
            chunk = []
        chunk.append(line[:300])
    chunks.append(chunk)
    for i, c in enumerate(chunks):
        annotate("warning" if i < 10 else "notice", "\n".join(c), title=f"logos pool {i + 1}")


def main():
    config = json.loads((HERE / "config.json").read_text())
    today = dt.datetime.now(dt.timezone.utc).date()

    ap = argparse.ArgumentParser()
    ap.add_argument("--out", type=Path)
    ap.add_argument("--start", type=dt.date.fromisoformat, default=today - dt.timedelta(days=1))
    ap.add_argument("--days", type=int, default=3)
    ap.add_argument("--cache", type=Path, default=HERE / ".cache")
    ap.add_argument("--check-pool", action="store_true", help="look up every brand on Wikidata and Commons")
    ap.add_argument("--guess-list", type=Path, help="write the game's list of guessable brands here")
    args = ap.parse_args()

    brands = load_pool(POOL)
    if args.guess_list:
        args.guess_list.write_text(json.dumps(guess_list(brands), ensure_ascii=False, separators=(",", ":")) + "\n")
    if args.check_pool:
        check_pool(brands, args.cache)
    if not args.out:
        return

    launch = dt.date.fromisoformat(config["launch"])
    seed = os.environ.get("CONTOUR_SEED") or config["devSeed"]
    for i in range(args.days):
        date = args.start + dt.timedelta(days=i)
        if date >= launch:
            generate_day(date, brands, launch, seed, args.out, args.cache)


if __name__ == "__main__":
    try:
        main()
    except SystemExit as e:
        if e.code not in (None, 0):
            annotate("error", str(e.code))
        raise
    except Exception as e:  # noqa: BLE001 - report anything as an annotation, then fail
        # Messages can hold a file name, which would name the day's brand in a public log;
        # set LOGOS_DEBUG=1 to see them.
        annotate("error", f"logos generator failed: {type(e).__name__}")
        if os.environ.get("LOGOS_DEBUG"):
            traceback.print_exc()
        raise SystemExit(1)
