"""Wikimedia APIs: daily pageviews (REST) and the article's short description (Action API)."""

import datetime as dt
import json
import time
import urllib.error
import urllib.parse
import urllib.request

# Wikimedia asks every client to identify itself: https://meta.wikimedia.org/wiki/User-Agent_policy
USER_AGENT = "ContourDailyPuzzles/1.0 (https://github.com/paravent/contour; Spike daily puzzle generator)"
PAGEVIEWS = "https://wikimedia.org/api/rest_v1/metrics/pageviews/per-article/en.wikipedia/all-access/user/{title}/daily/{start}/{end}"
ACTION_API = "https://en.wikipedia.org/w/api.php"


class NotFound(Exception):
    """The API has no data for this title (a deterministic answer, unlike a network error)."""


def _get_json(url: str, attempts: int = 4):
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT, "Accept": "application/json"})
    for i in range(attempts):
        try:
            with urllib.request.urlopen(req, timeout=30) as res:
                return json.loads(res.read().decode("utf-8"))
        except urllib.error.HTTPError as e:
            if e.code == 404:
                raise NotFound(url) from e
            # Rate limits and server errors are worth a retry; anything else is a bug.
            if e.code not in (429, 500, 502, 503, 504) or i == attempts - 1:
                raise
        except (urllib.error.URLError, TimeoutError):
            if i == attempts - 1:
                raise
        time.sleep(2 ** i)


def pageviews_url(title: str, start: dt.date, end: dt.date) -> str:
    # Titles use underscores, and everything else (including "/") is percent-encoded.
    quoted = urllib.parse.quote(title.replace(" ", "_"), safe="")
    return PAGEVIEWS.format(title=quoted, start=start.strftime("%Y%m%d"), end=end.strftime("%Y%m%d"))


def parse_pageviews(payload, start: dt.date, end: dt.date):
    """Daily views from start to end inclusive; a day the API left out comes back as None."""
    by_day = {}
    for item in payload.get("items", []):
        day = dt.datetime.strptime(item["timestamp"][:8], "%Y%m%d").date()
        by_day[day] = int(item["views"])
    n = (end - start).days + 1
    return [by_day.get(start + dt.timedelta(days=i)) for i in range(n)]


def fetch_pageviews(title: str, start: dt.date, end: dt.date):
    try:
        payload = _get_json(pageviews_url(title, start, end))
    except NotFound:
        return [None] * ((end - start).days + 1)
    return parse_pageviews(payload, start, end)


def info_url(title: str) -> str:
    params = {
        "action": "query",
        "format": "json",
        "formatversion": "2",
        "prop": "description|extracts|info",
        "inprop": "url",
        "exintro": "1",
        "explaintext": "1",
        "exsentences": "2",
        "redirects": "1",
        "titles": title,
    }
    return f"{ACTION_API}?{urllib.parse.urlencode(params)}"


def parse_info(payload):
    """The page's canonical title, short description, opening sentences and URL."""
    pages = payload.get("query", {}).get("pages", [])
    if not pages or pages[0].get("missing") or pages[0].get("invalid"):
        raise NotFound("no such page")
    p = pages[0]
    return {
        "title": p["title"],
        "description": p.get("description", ""),
        "extract": " ".join(p.get("extract", "").split()),
        "url": p.get("fullurl") or "https://en.wikipedia.org/wiki/" + urllib.parse.quote(p["title"].replace(" ", "_")),
    }


def fetch_info(title: str):
    return parse_info(_get_json(info_url(title)))
