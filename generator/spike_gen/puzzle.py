"""Build one day's Spike puzzle: pick an article, fetch a year of pageviews, check the chart."""

import base64
import datetime as dt
import hashlib
import json
import re
import statistics
from pathlib import Path

from . import wiki
from .pool import Article, bare_name

DAYS = 365
# The chart ends this many days before the puzzle's date. The daily job builds a week
# ahead, and every day of every chart it builds must already be published by Wikimedia,
# so the same date always gets the same chart (and the same answer).
LAG_DAYS = 10
MIN_MEDIAN = 300  # a typical day has at least this many readers: the article is well known
MIN_PEAK_RATIO = 4.0  # the highest day is at least this many typical days: a visible spike
SPIKE_RATIO = 2.5  # a marked spike is at least this many typical days
SPIKE_GAP_DAYS = 21  # marked spikes are at least three weeks apart
MAX_SPIKES = 3


class Rejected(Exception):
    """The article failed a quality check; the scheduler moves on to the next one."""


def puzzle_number(date: dt.date, launch: dt.date) -> int:
    return (date - launch).days + 1


def rotation(articles, seed: str):
    """A fixed shuffle of the pool, set by the seed."""
    return sorted(articles, key=lambda a: hashlib.sha256(f"{seed}:spike:{a.id}".encode()).hexdigest())


def window(date: dt.date):
    end = date - dt.timedelta(days=LAG_DAYS)
    return end - dt.timedelta(days=DAYS - 1), end


def check_series(views, article_id: str = "?"):
    """Raise Rejected unless the year is complete, well read and has a clear spike."""
    missing = sum(v is None for v in views)
    if missing:
        raise Rejected(f"{article_id}: {missing} days of pageviews missing")
    median = statistics.median(views)
    if median < MIN_MEDIAN:
        raise Rejected(f"{article_id}: median {median:.0f} views a day is too few")
    ratio = max(views) / median
    if ratio < MIN_PEAK_RATIO:
        raise Rejected(f"{article_id}: chart too flat (peak is {ratio:.1f}x the median)")


def find_spikes(views):
    """Indexes of the tallest peaks, tallest first: well above typical and weeks apart."""
    median = statistics.median(views)
    picked = []
    for i in sorted(range(len(views)), key=lambda i: (-views[i], i)):
        if views[i] < SPIKE_RATIO * median or len(picked) == MAX_SPIKES:
            break
        if all(abs(i - j) >= SPIKE_GAP_DAYS for j in picked):
            picked.append(i)
    return picked


def redact(description: str, name: str) -> str:
    """Hide words of the answer that a short description gives away ("Annual Super Bowl...")."""
    words = {w.lower() for w in re.findall(r"[^\W_]+", bare_name(name)) if len(w) >= 4}
    return re.sub(r"[^\W_]+", lambda m: "█" * len(m.group()) if m.group().lower() in words else m.group(), description)


def load_series(article: Article, start: dt.date, end: dt.date, cache_dir: Path):
    """Pageviews for the window, cached once complete (published days never change)."""
    path = cache_dir / "spike" / f"{article.id}_{start:%Y%m%d}_{end:%Y%m%d}.json"
    if path.exists():
        return json.loads(path.read_text())
    views = wiki.fetch_pageviews(article.title, start, end)
    if all(v is not None for v in views):
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(views))
    return views


def load_info(article: Article):
    """Description and intro for the reveal. Cosmetic only, so a failure here never moves the answer."""
    try:
        return wiki.fetch_info(article.title)
    except Exception:  # noqa: BLE001 - any failure falls back to the pool's own category
        return {"title": article.title, "description": "", "extract": "",
                "url": "https://en.wikipedia.org/wiki/" + article.title.replace(" ", "_")}


def build(article: Article, date: dt.date, number: int, out_dir: Path, cache_dir: Path,
          fetch_series=load_series, fetch_info=load_info):
    start, end = window(date)
    views = fetch_series(article, start, end, cache_dir)
    check_series(views, article.id)
    info = fetch_info(article)

    name = bare_name(article.name)
    secret = {
        "id": article.id,
        "name": article.name,
        "category": article.category,
        "description": redact(info["description"], article.name),
        "extract": info["extract"][:400],
        "url": info["url"],
        "letter": name[0].upper(),
    }
    puzzle = {
        "game": "spike",
        "number": number,
        "date": date.isoformat(),
        "start": start.isoformat(),
        "views": views,
        "spikes": find_spikes(views),
        # Lightly encoded so the answer isn't readable at a glance in dev tools.
        "secret": base64.b64encode(json.dumps(secret).encode()).decode(),
    }

    day_dir = out_dir / date.isoformat()
    day_dir.mkdir(parents=True, exist_ok=True)
    (day_dir / "puzzle.json").write_text(json.dumps(puzzle, separators=(",", ":")))
    return puzzle
