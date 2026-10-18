import base64
import datetime as dt
import json
import subprocess
import sys
from pathlib import Path

import pytest

GEN = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(GEN))

from generate_spike import generate_day  # noqa: E402
from spike_gen import wiki  # noqa: E402
from spike_gen.pool import Article, bare_name, load_pool, pool_json  # noqa: E402
from spike_gen.puzzle import (  # noqa: E402
    DAYS, LAG_DAYS, Rejected, check_series, find_spikes, redact, rotation, window,
)

POOL = GEN / "spike_pool.csv"
WEB_POOL = GEN.parent / "web" / "public" / "data" / "spike-articles.json"
CATEGORIES = {
    "holiday", "sports event", "event", "musician", "song", "actor", "athlete", "film", "tv series",
    "video game", "technology", "science", "place", "folklore", "food", "public figure",
}

# Hand-written stand-ins for API responses, shaped like the documented formats.
PAGEVIEWS_PAYLOAD = {"items": [
    {"project": "en.wikipedia", "article": "Example", "granularity": "daily", "timestamp": "2026010100",
     "access": "all-access", "agent": "user", "views": 120},
    {"project": "en.wikipedia", "article": "Example", "granularity": "daily", "timestamp": "2026010300",
     "access": "all-access", "agent": "user", "views": 4500},
]}
INFO_PAYLOAD = {"batchcomplete": True, "query": {
    "redirects": [{"from": "Example redirect", "to": "Example"}],
    "pages": [{"pageid": 1, "ns": 0, "title": "Example", "description": "Annual example event",
               "extract": "Example is an   event.\nIt recurs.", "fullurl": "https://en.wikipedia.org/wiki/Example"}],
}}


def year(base=1000, spikes=None):
    views = [base + (i % 7) * 10 for i in range(DAYS)]
    for i, v in (spikes or {}).items():
        views[i] = v
    return views


def test_pool_is_unique_and_valid():
    pool = load_pool(POOL)
    assert len(pool) >= 300
    assert len({a.id for a in pool}) == len(pool)
    assert len({a.title for a in pool}) == len(pool)
    assert len({a.name.lower() for a in pool}) == len(pool)
    for a in pool:
        assert a.category in CATEGORIES, a.id
        assert a.title.strip() == a.title and "_" not in a.title, a.id
        assert bare_name(a.name)[0].isalnum(), a.id


def test_web_pool_matches_csv():
    # Regenerate with: python generator/generate_spike.py --export-pool web/public/data/spike-articles.json
    assert json.loads(WEB_POOL.read_text()) == pool_json(load_pool(POOL))


def test_bare_name_drops_qualifiers():
    assert bare_name("Halloween (1978 film)") == "Halloween"
    assert bare_name("Wicked: For Good") == "Wicked: For Good"


def test_rotation_is_stable_for_a_seed():
    pool = load_pool(POOL)
    assert [a.id for a in rotation(pool, "a")] == [a.id for a in rotation(pool, "a")]
    assert [a.id for a in rotation(pool, "a")] != [a.id for a in rotation(pool, "b")]


def test_window_is_a_year_that_is_already_published():
    start, end = window(dt.date(2026, 10, 18))
    assert (end - start).days + 1 == DAYS
    assert end == dt.date(2026, 10, 18) - dt.timedelta(days=LAG_DAYS)
    # The daily job builds up to 7 days ahead, just after midnight UTC.
    assert LAG_DAYS >= 7 + 2


def test_pageviews_url_encodes_titles():
    url = wiki.pageviews_url("3I/ATLAS", dt.date(2025, 10, 9), dt.date(2026, 10, 8))
    assert url.endswith("/user/3I%2FATLAS/daily/20251009/20261008")
    assert "/user/Valentine%27s_Day/" in wiki.pageviews_url("Valentine's Day", dt.date(2026, 1, 1), dt.date(2026, 1, 2))
    assert "/user/Beyonc%C3%A9/" in wiki.pageviews_url("Beyoncé", dt.date(2026, 1, 1), dt.date(2026, 1, 2))


def test_parse_pageviews_marks_missing_days():
    views = wiki.parse_pageviews(PAGEVIEWS_PAYLOAD, dt.date(2026, 1, 1), dt.date(2026, 1, 4))
    assert views == [120, None, 4500, None]


def test_parse_info():
    info = wiki.parse_info(INFO_PAYLOAD)
    assert info == {"title": "Example", "description": "Annual example event",
                    "extract": "Example is an event. It recurs.", "url": "https://en.wikipedia.org/wiki/Example"}
    with pytest.raises(wiki.NotFound):
        wiki.parse_info({"query": {"pages": [{"ns": 0, "title": "Nope", "missing": True}]}})


def test_quality_checks():
    check_series(year(spikes={100: 20000}))
    with pytest.raises(Rejected, match="missing"):
        check_series(year(spikes={100: 20000})[:-1] + [None])
    with pytest.raises(Rejected, match="too few"):
        check_series(year(base=50, spikes={100: 20000}))
    with pytest.raises(Rejected, match="flat"):
        check_series(year(spikes={100: 3000}))


def test_find_spikes_keeps_tall_peaks_apart():
    views = year(spikes={50: 9000, 52: 8000, 200: 6000, 300: 3500, 320: 2000})
    assert find_spikes(views) == [50, 200, 300]
    assert find_spikes(year()) == []


def test_redact_hides_the_answer():
    assert redact("Annual championship game of the National Football League", "Super Bowl") == \
        "Annual championship game of the National Football League"
    assert redact("Super Bowl halftime entertainment", "Super Bowl halftime show") == \
        "█████ ████ ████████ entertainment"
    assert redact("Christian holiday celebrating Christmas Day", "Christmas") == "Christian holiday celebrating █████████ Day"


def fake_series(article, start, end, cache):
    # Articles whose id starts with "flat" have no spike, so the day passes to the next one.
    return year() if article.id.startswith("flat") else year(spikes={(end - start).days - 3: 25000})


def fake_info(article):
    return {"title": article.title, "description": "A test article", "extract": "Intro.", "url": "https://example.org"}


def test_generate_day_skips_rejected_articles(tmp_path, capsys):
    pool = [Article("flat-a", "Flat A", "Flat A", "event"), Article("flat-b", "Flat B", "Flat B", "event"),
            Article("spiky", "Spiky", "Spiky", "event")]
    date, launch = dt.date(2026, 10, 20), dt.date(2026, 10, 18)
    picked = generate_day(date, pool, launch, "seed", tmp_path, tmp_path, fetch_series=fake_series, fetch_info=fake_info)
    assert picked.id == "spiky"
    assert "::notice::spike 2026-10-20 #3 ok" in capsys.readouterr().out

    puzzle = json.loads((tmp_path / "2026-10-20" / "puzzle.json").read_text())
    assert puzzle["game"] == "spike" and puzzle["number"] == 3
    assert len(puzzle["views"]) == DAYS and puzzle["spikes"] == [DAYS - 4]
    assert puzzle["start"] == window(date)[0].isoformat()
    secret = json.loads(base64.b64decode(puzzle["secret"]))
    assert secret["name"] == "Spiky" and secret["letter"] == "S" and secret["category"] == "event"


def test_generate_day_fails_when_nothing_passes(tmp_path):
    pool = [Article("flat-a", "Flat A", "Flat A", "event")]
    with pytest.raises(RuntimeError, match="no article"):
        generate_day(dt.date(2026, 10, 20), pool, dt.date(2026, 10, 18), "s", tmp_path, tmp_path,
                     fetch_series=fake_series, fetch_info=fake_info)


def test_cli_reports_failures_as_annotations(tmp_path):
    res = subprocess.run([sys.executable, str(GEN / "generate_spike.py"), "--out", str(tmp_path),
                          "--start", "2026-10-20", "--days", "0", "--export-pool", str(tmp_path / "missing" / "x.json")],
                         capture_output=True, text=True)
    assert res.returncode == 1
    assert res.stdout.startswith("::error::spike generator failed:")
