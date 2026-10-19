"""Logo files from Wikimedia Commons, and the Wikidata lookups used to build the pool.

The daily generator only talks to Commons: each pool row names its logo file, and
the Commons API says what licence the file carries and where a PNG rendering of
it lives (SVGs are rendered by Commons at a fixed width). Wikidata is only used
by --check-pool, to find each brand's logo (property P154) and to check the
founding year and country in the pool.

Errors come in two kinds, as for Palette. A file that is missing or not public
domain is the same on every run, so it raises Unusable and the scheduler moves on
to the next brand. Anything else (timeouts, 5xx, a blocked request) raises
FetchError after a few retries and fails the run: skipping on a passing network
hiccup would hand the day to a different brand than an earlier run chose.
"""

import json
import time
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass

COMMONS_API = "https://commons.wikimedia.org/w/api.php"
WIKIDATA_API = "https://www.wikidata.org/w/api.php"
FILE_PAGE = "https://commons.wikimedia.org/wiki/File:{name}"
# Commons renders SVGs to PNG at this width (and never upscales a smaller PNG).
# 960 is one of Wikimedia's standard thumbnail sizes, which are served from cache.
THUMB_WIDTH = 960

# Wikimedia asks every client to identify itself: https://meta.wikimedia.org/wiki/User-Agent_policy
HEADERS = {"User-Agent": "ContourDailyPuzzles/1.0 (https://github.com/paravent/contour; Logos daily puzzle generator)"}

_SPACING = 0.3  # seconds between requests
_last = [0.0]


class Unusable(Exception):
    """The file can't be used, and won't be on any run (missing, not public domain)."""


class FetchError(Exception):
    """Wikimedia didn't answer properly; try the whole run again later."""


def _get(url, attempts=5, timeout=40):
    err = None
    for i in range(attempts):
        time.sleep(max(0.0, _last[0] + _SPACING - time.monotonic()))
        _last[0] = time.monotonic()
        try:
            req = urllib.request.Request(url, headers=HEADERS)
            with urllib.request.urlopen(req, timeout=timeout) as r:
                return r.read()
        except urllib.error.HTTPError as e:
            if e.code in (404, 410):
                raise Unusable(f"{url} returned {e.code}") from e
            if e.code < 500 and e.code != 429:
                raise FetchError(f"{url} returned {e.code}") from e
            err = e
            if e.code == 429:
                after = e.headers.get("Retry-After", "")
                time.sleep(max(10 * (i + 1), int(after) if after.isdigit() else 0))
        except (urllib.error.URLError, TimeoutError, ConnectionError) as e:
            err = e
        time.sleep(2 * (i + 1))
    raise FetchError(f"{url}: {err}")


def get_json(base, params):
    return json.loads(_get(f"{base}?{urllib.parse.urlencode(params)}"))


def get_bytes(url):
    return _get(url)


def file_key(name: str) -> str:
    """Commons file names compare with underscores as spaces and the first letter capitalised."""
    name = name.strip().replace("_", " ")
    if name.lower().startswith("file:"):
        name = name[5:].strip()
    return name[:1].upper() + name[1:]


def page_url(name: str) -> str:
    return FILE_PAGE.format(name=urllib.parse.quote(file_key(name).replace(" ", "_")))


@dataclass
class FileInfo:
    name: str
    missing: bool = False
    licence: str = ""  # Commons' short licence name, e.g. "Public domain"
    licence_code: str = ""  # machine-readable, e.g. "pd", "cc0", "cc-by-sa-4.0"
    url: str = ""
    thumb_url: str = ""
    width: int = 0
    height: int = 0
    mime: str = ""

    @property
    def public_domain(self) -> bool:
        return is_public_domain(self.licence_code, self.licence)

    @property
    def page_url(self) -> str:
        return page_url(self.name)


def is_public_domain(code: str, short: str) -> bool:
    """Public domain or CC0 only. Logos under CC BY-SA and the like are free, but not ours to pixelate without strings."""
    code, short = (code or "").strip().lower(), (short or "").strip().lower()
    return code in ("pd", "cc0", "cc-zero") or short in ("public domain", "cc0", "cc-zero") or short.startswith("pd-")


def _meta(ext, key):
    value = (ext or {}).get(key, {}).get("value", "")
    return value if isinstance(value, str) else str(value)


def parse_file_info(payload, names):
    """FileInfo for each requested name, from an action=query&prop=imageinfo response (formatversion 2)."""
    query = payload.get("query") or {}
    renamed = {n["from"]: n["to"] for n in query.get("normalized") or []}
    pages = {}
    for page in query.get("pages") or []:
        title = file_key(page.get("title", ""))
        info = (page.get("imageinfo") or [{}])[0]
        if page.get("missing") or page.get("invalid") or not info:
            pages[title] = FileInfo(title, missing=True)
            continue
        ext = info.get("extmetadata") or {}
        pages[title] = FileInfo(
            name=title,
            licence=_meta(ext, "LicenseShortName"),
            licence_code=_meta(ext, "License"),
            url=info.get("url", ""),
            thumb_url=info.get("thumburl") or info.get("url", ""),
            width=int(info.get("width") or 0),
            height=int(info.get("height") or 0),
            mime=info.get("mime", ""),
        )
    out = {}
    for name in names:
        asked = f"File:{file_key(name)}"
        title = file_key(renamed.get(asked, asked))
        out[name] = pages.get(title) or FileInfo(file_key(name), missing=True)
    return out


def file_info(names, width=THUMB_WIDTH):
    """Licence and rendering URLs for Commons files, 50 to a request."""
    out = {}
    names = list(dict.fromkeys(names))
    for i in range(0, len(names), 50):
        batch = names[i:i + 50]
        payload = get_json(COMMONS_API, {
            "action": "query",
            "format": "json",
            "formatversion": "2",
            "prop": "imageinfo",
            "iiprop": "url|size|mime|extmetadata",
            "iiextmetadatafilter": "License|LicenseShortName",
            "iiurlwidth": str(width),
            "titles": "|".join(f"File:{file_key(n)}" for n in batch),
        })
        out.update(parse_file_info(payload, batch))
    return out


# ---- Wikidata, for --check-pool only ----

@dataclass
class Entity:
    qid: str
    label: str = ""
    description: str = ""
    logos: tuple = ()  # P154 logo image, best rank first
    icons: tuple = ()  # P8972 small logo or icon
    inception: int | None = None  # P571, year
    countries: tuple = ()  # P17 then P495, as QIDs


def _claims(entity, prop):
    """Values of a property, preferred rank first, deprecated and ended ones left out."""
    claims = [c for c in (entity.get("claims") or {}).get(prop, []) if c.get("rank") != "deprecated"]
    claims = [c for c in claims if "P582" not in (c.get("qualifiers") or {})] or claims
    claims.sort(key=lambda c: c.get("rank") != "preferred")
    out = []
    for c in claims:
        value = ((c.get("mainsnak") or {}).get("datavalue") or {}).get("value")
        if value is not None:
            out.append(value)
    return out


def parse_entity(entity) -> Entity:
    years = []
    for v in _claims(entity, "P571"):
        t = v.get("time", "") if isinstance(v, dict) else ""
        if len(t) > 5 and t[1:5].isdigit():
            years.append(int(t[1:5]) * (-1 if t[0] == "-" else 1))
    countries = [v["id"] for prop in ("P17", "P495") for v in _claims(entity, prop) if isinstance(v, dict) and "id" in v]
    return Entity(
        qid=entity.get("id", ""),
        label=((entity.get("labels") or {}).get("en") or {}).get("value", ""),
        description=((entity.get("descriptions") or {}).get("en") or {}).get("value", ""),
        logos=tuple(v for v in _claims(entity, "P154") if isinstance(v, str)),
        icons=tuple(v for v in _claims(entity, "P8972") if isinstance(v, str)),
        inception=min(years) if years else None,
        countries=tuple(dict.fromkeys(countries)),
    )


def entities_by_enwiki(titles):
    """Wikidata entities for English Wikipedia titles (redirects followed); a title with no item is left out."""
    out = {}
    # One title a request: only then does Wikidata normalise the title, and a redirect's
    # answer can't be mistaken for another title's.
    for title in dict.fromkeys(titles):
        payload = get_json(WIKIDATA_API, {
            "action": "wbgetentities",
            "format": "json",
            "sites": "enwiki",
            "titles": title,
            "props": "labels|descriptions|claims",
            "languages": "en",
            "redirects": "yes",
            "normalize": "1",
        })
        if "error" in payload:
            raise FetchError(f"wikidata: {payload['error']}")
        for qid, entity in (payload.get("entities") or {}).items():
            if qid.startswith("Q") and "missing" not in entity:
                out[title] = parse_entity(entity)
    return out


def labels(qids):
    out = {}
    qids = list(dict.fromkeys(qids))
    for i in range(0, len(qids), 50):
        payload = get_json(WIKIDATA_API, {
            "action": "wbgetentities", "format": "json", "ids": "|".join(qids[i:i + 50]),
            "props": "labels", "languages": "en",
        })
        for qid, entity in (payload.get("entities") or {}).items():
            out[qid] = ((entity.get("labels") or {}).get("en") or {}).get("value", qid)
    return out
