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
import io
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


def check_pool(brands, cache, sheet_dir=None):
    """Look every brand up on Wikidata and its logo on Commons; report anything that disagrees with the pool."""
    from logos_gen import puzzle

    entities = commons.entities_by_enwiki([b.wiki for b in brands])
    country_names = commons.labels([q for e in entities.values() for q in e.countries])
    wanted = {}
    for b in brands:
        e = entities.get(b.wiki)
        for name in ([b.file] if b.file else []) + list(e.logos[:1] if e else []) + list(e.icons[:1] if e else []):
            wanted[name] = None
    infos = commons.file_info(list(wanted))

    lines, usable = [], 0
    for b in brands:
        e = entities.get(b.wiki)
        if not e:
            lines.append(f"NOITEM {b.id} [{b.wiki}]")
            continue
        notes = []
        if e.inception is not None and abs(e.inception - b.founded) > 1:
            notes.append(f"year {e.inception}")
        names = [country_names.get(q, q) for q in e.countries]
        if names and b.country not in names:
            notes.append(f"country {'/'.join(names[:3])}")
        logo = e.logos[0] if e.logos else ""
        if b.file and logo and commons.file_key(b.file) != commons.file_key(logo):
            notes.append(f"P154 now {logo}")

        def describe(name):
            i = infos.get(name)
            if not i:
                return "-"
            if i.missing:
                return "missing"
            return f"{'PD' if i.public_domain else 'X'}:{i.licence_code or i.licence}:{i.width}x{i.height}"

        icon = e.icons[0] if e.icons else ""
        chosen = b.file or logo
        if chosen and not infos[chosen].missing and infos[chosen].public_domain:
            if b.file:
                try:
                    puzzle.prepare(b, puzzle.fetch(b, cache)[1])
                    usable += 1
                except Rejected as err:
                    notes.append(f"REJECTED {err}")
        tag = "OK" if b.file and not notes else "NEW" if not b.file else "CHECK"
        lines.append(
            f"{tag} {b.id} {e.qid} | logo={chosen or '-'} {describe(chosen) if chosen else ''}"
            f" | icon={icon or '-'} {describe(icon) if icon else ''} | {'; '.join(notes)} [{e.label}: {e.description[:40]}]"
        )

    if sheet_dir:
        contact_sheets(brands, entities, infos, sheet_dir)
    for line in lines:
        print(line)
    chunk = 15
    for i in range(0, len(lines), chunk):
        kind = "warning" if i // chunk < 10 else "notice"
        annotate(kind, "\n".join(lines[i:i + chunk]), title=f"logos pool {i // chunk + 1}")
    answerable = len(answer_pool(brands))
    annotate("notice", f"logos pool: {len(brands)} brands, {answerable} answerable, {usable} logos pass the licence and image checks")


def contact_sheets(brands, entities, infos, out_dir, per_sheet=60, cols=6, cell=(150, 80)):
    """Every candidate logo (pool file or Wikidata logo, then Wikidata icon) as it will be framed, labelled."""
    from PIL import Image, ImageDraw

    from logos_gen import render

    small = commons.file_info(list(infos), width=250)
    tiles = []
    for b in brands:
        e = entities.get(b.wiki)
        names = [b.file or (e.logos[0] if e and e.logos else "")] + [e.icons[0] if e and e.icons else ""]
        for tag, name in zip(("", "+icon"), names):
            info = small.get(name)
            if not name or not info or info.missing or not info.public_domain:
                continue
            try:
                img = Image.open(io.BytesIO(commons.get_bytes(info.thumb_url)))
                img.load()
            except (commons.Unusable, OSError):
                continue
            flat, bg = render.flatten(img)
            framed = render.frame(flat, bg)
            framed.thumbnail((cell[0] - 8, cell[1] - 18))
            tiles.append((f"{b.id}{tag}", framed))
    out_dir.mkdir(parents=True, exist_ok=True)
    for s in range(0, len(tiles), per_sheet):
        batch = tiles[s:s + per_sheet]
        rows = -(-len(batch) // cols)
        sheet = Image.new("RGB", (cols * cell[0], rows * cell[1]), (128, 128, 128))
        draw = ImageDraw.Draw(sheet)
        for i, (label, img) in enumerate(batch):
            x, y = (i % cols) * cell[0], (i // cols) * cell[1]
            sheet.paste(img, (x + (cell[0] - img.width) // 2, y + 2))
            draw.text((x + 4, y + cell[1] - 14), label[:24], fill=(0, 0, 0))
        sheet.convert("P", palette=Image.ADAPTIVE, colors=64).save(out_dir / f"sheet{s // per_sheet + 1:02d}.png", optimize=True)


def main():
    config = json.loads((HERE / "config.json").read_text())
    today = dt.datetime.now(dt.timezone.utc).date()

    ap = argparse.ArgumentParser()
    ap.add_argument("--out", type=Path)
    ap.add_argument("--start", type=dt.date.fromisoformat, default=today - dt.timedelta(days=1))
    ap.add_argument("--days", type=int, default=3)
    ap.add_argument("--cache", type=Path, default=HERE / ".cache")
    ap.add_argument("--check-pool", action="store_true", help="look up every brand on Wikidata and Commons")
    ap.add_argument("--sheet", type=Path, help="with --check-pool: write contact sheets of every logo here (a folder)")
    ap.add_argument("--guess-list", type=Path, help="write the game's list of guessable brands here")
    args = ap.parse_args()

    brands = load_pool(POOL)
    if args.guess_list:
        args.guess_list.write_text(json.dumps(guess_list(brands), ensure_ascii=False, separators=(",", ":")) + "\n")
    if args.check_pool:
        check_pool(brands, args.cache, args.sheet)
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
