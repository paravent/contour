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


def _get_json(url: str, attempts: int = 6):
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT, "Accept": "application/json"})
    for i in range(attempts):
        wait = 2 ** i
        try:
            with urllib.request.urlopen(req, timeout=30) as res:
                return json.loads(res.read().decode("utf-8"))
        except urllib.error.HTTPError as e:
            if e.code == 404:
                raise NotFound(url) from e
            # Rate limits and server errors are worth a retry; anything else is a bug.
            if e.code not in (429, 500, 502, 503, 504) or i == attempts - 1:
                raise
            if e.code == 429:
                retry_after = e.headers.get("Retry-After", "")
                wait = max(5 * 2 ** i, int(retry_after) if retry_after.isdigit() else 0)
        except (urllib.error.URLError, TimeoutError):
            if i == attempts - 1:
                raise
        time.sleep(min(wait, 120))


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


def canonical_titles(titles):
    """Map each title to the page it ends up at after normalising and redirects, or None if missing.

    One Action API request covers 50 titles, which keeps a whole-pool audit polite.
    """
    out = {}
    for i in range(0, len(titles), 50):
        batch = titles[i:i + 50]
        params = {"action": "query", "format": "json", "formatversion": "2", "redirects": "1", "titles": "|".join(batch)}
        out.update(parse_canonical(_get_json(f"{ACTION_API}?{urllib.parse.urlencode(params)}"), batch))
    return out


def parse_canonical(payload, titles):
    q = payload.get("query", {})
    hops = {n["from"]: n["to"] for n in q.get("normalized", []) + q.get("redirects", [])}
    pages = {p["title"]: p for p in q.get("pages", [])}
    out = {}
    for t in titles:
        seen, cur = set(), t
        while cur in hops and cur not in seen:
            seen.add(cur)
            cur = hops[cur]
        page = pages.get(cur)
        out[t] = None if page is None or page.get("missing") or page.get("invalid") else cur
    return out
