"""Fetch artwork records and images from the Art Institute of Chicago and the Met.

Both museums publish open-access APIs with no key:
  AIC  https://api.artic.edu/docs/   (images through IIIF at www.artic.edu/iiif/2)
  Met  https://metmuseum.github.io/

Errors come in two kinds. A record that is missing, not public domain or has no
image is the same on every run, so it raises Unusable and the scheduler moves on
to the next painting. Anything else (timeouts, 5xx, a blocked request) raises
FetchError after a few retries and fails the run: skipping on a passing network
hiccup would hand the day to a different painting than an earlier run chose.
"""

import json
import time
import unicodedata
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass

AIC_API = "https://api.artic.edu/api/v1/artworks"
AIC_FIELDS = "id,title,artist_title,artist_display,date_end,is_public_domain,image_id,credit_line"
AIC_IMAGE = "https://www.artic.edu/iiif/2/{image_id}/full/843,/0/default.jpg"
AIC_PAGE = "https://www.artic.edu/artworks/{id}"
MET_API = "https://collectionapi.metmuseum.org/public/collection/v1"
MET_SEARCH = "https://collectionapi.metmuseum.org/public/collection/v1.1/search"

MUSEUMS = {"aic": "Art Institute of Chicago", "met": "The Metropolitan Museum of Art"}

# AIC asks API users to identify themselves; the Met turns away requests without a user agent.
HEADERS = {
    "User-Agent": "contour-daily-puzzles/1.0 (+https://github.com/paravent/contour)",
    "AIC-User-Agent": "contour-daily-puzzles (https://github.com/paravent/contour)",
}


class Unusable(Exception):
    """The record can't be used, and won't be on any run (missing, not public domain, no image)."""


class FetchError(Exception):
    """The museum didn't answer properly; try the whole run again later."""


@dataclass
class Artwork:
    museum: str  # "aic" or "met"
    object_id: str
    title: str
    artist: str
    year: int | None
    public_domain: bool
    image_url: str | None
    page_url: str
    credit: str


# Seconds between requests per host: AIC documents a limit of 60 a minute, and the Met
# turns away bursts with 403s.
_SPACING = {"artic.edu": 1.05, "metmuseum.org": 0.6}
_last = {}


def _throttle(url):
    for host, gap in _SPACING.items():
        if host in url:
            time.sleep(max(0.0, _last.get(host, 0.0) + gap - time.monotonic()))
            _last[host] = time.monotonic()


def _get(url, attempts=4, timeout=40):
    for i in range(attempts):
        _throttle(url)
        try:
            req = urllib.request.Request(url, headers=HEADERS)
            with urllib.request.urlopen(req, timeout=timeout) as r:
                return r.read()
        except urllib.error.HTTPError as e:
            if e.code in (404, 410):
                raise Unusable(f"{url} returned {e.code}") from e
            # The Met answers a burst with 403 for a while; back off and retry.
            throttled = e.code == 429 or (e.code == 403 and "metmuseum.org" in url)
            if e.code < 500 and not throttled:
                raise FetchError(f"{url} returned {e.code}") from e
            err = e
            if throttled:
                time.sleep(15 * (i + 1))
        except (urllib.error.URLError, TimeoutError, ConnectionError) as e:
            err = e
        time.sleep(2 * (i + 1))
    raise FetchError(f"{url}: {err}")


def get_json(url):
    return json.loads(_get(url))


def get_bytes(url):
    return _get(url)


def fetch_artwork(museum: str, object_id: str) -> Artwork:
    if not str(object_id).isdigit():
        raise Unusable(f"{museum}:{object_id!r} is not an object ID")
    if museum == "aic":
        data = get_json(f"{AIC_API}/{object_id}?fields={AIC_FIELDS}").get("data") or {}
        if not data:
            raise Unusable(f"aic:{object_id} has no record")
        return _aic_artwork(data)
    if museum == "met":
        data = get_json(f"{MET_API}/objects/{object_id}")
        if not data or "objectID" not in data:
            raise Unusable(f"met:{object_id} has no record")
        return Artwork(
            museum="met",
            object_id=str(object_id),
            title=data.get("title") or "",
            artist=data.get("artistDisplayName") or "",
            year=data.get("objectEndDate"),
            public_domain=bool(data.get("isPublicDomain")),
            image_url=data.get("primaryImageSmall") or data.get("primaryImage") or None,
            page_url=data.get("objectURL") or f"https://www.metmuseum.org/art/collection/search/{object_id}",
            credit=MUSEUMS["met"],
        )
    raise ValueError(f"unknown museum {museum!r}")


def _aic_artwork(data) -> Artwork:
    image_id = data.get("image_id")
    return Artwork(
        museum="aic",
        object_id=str(data["id"]),
        title=data.get("title") or "",
        artist=data.get("artist_title") or data.get("artist_display") or "",
        year=data.get("date_end"),
        public_domain=bool(data.get("is_public_domain")),
        image_url=AIC_IMAGE.format(image_id=image_id) if image_id else None,
        page_url=AIC_PAGE.format(id=data["id"]),
        credit=MUSEUMS["aic"],
    )


def plain(s: str) -> str:
    """Lowercase ASCII words, for loose matching of names and titles."""
    s = unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode().lower()
    return " ".join("".join(c if c.isalnum() else " " for c in s).split())


_PARTICLES = {"the", "elder", "younger", "de", "van", "der", "von", "la", "le", "di", "da"}


def artist_matches(expected: str, found: str) -> bool:
    """Does the museum's artist name contain the pool's surname? Guards against a wrong object ID."""
    words = [w for w in plain(expected).split() if w not in _PARTICLES and len(w) > 2]
    return bool(words) and words[-1] in plain(found).split()


def search(museum: str, title: str, artist: str, limit=12):
    """Candidate records for a title by an artist, best first (for growing the pool)."""
    if museum == "aic":
        q = urllib.parse.urlencode({"q": title, "fields": AIC_FIELDS, "limit": 40})
        # AIC search hits carry the fields already (and the API allows ~60 requests a minute).
        found = (_aic_artwork(h) for h in get_json(f"{AIC_API}/search?{q}").get("data") or [])
    else:
        # v1/search was retired in October 2026; v1.1 is paginated.
        q = urllib.parse.urlencode({"q": f"{title} {artist}", "hasImages": "true", "limit": limit, "offset": 0})
        found = (_met_or_none(i) for i in _met_ids(get_json(f"{MET_SEARCH}?{q}"))[:limit])
    want = set(plain(title).split())
    out = []
    for art in found:
        if art and artist_matches(artist, art.artist):
            out.append(art)
            # A record with nearly all the title's words is the one; stop fetching.
            if len(want & set(plain(art.title).split())) >= 0.8 * len(want) or len(out) >= 5:
                break
    return out


def _met_ids(data):
    """Object IDs from a v1.1 search response, whichever shape it takes."""
    if isinstance(data, dict):
        for key in ("objectIDs", "results", "data", "hits", "objects", "items"):
            if key in data:
                return _met_ids(data[key])
        raise FetchError(f"unexpected Met search response: {json.dumps(data)[:300]}")
    out = []
    for item in data or []:
        if isinstance(item, dict):
            item = item.get("objectID") or item.get("id") or item.get("_source", {}).get("objectID")
        if item:
            out.append(item)
    return out


def _met_or_none(object_id):
    try:
        return fetch_artwork("met", str(object_id))
    except Unusable:
        return None
