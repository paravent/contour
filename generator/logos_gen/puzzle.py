"""Build one day's Logos puzzle: pick a brand, fetch its logo from Commons, render six stages."""

import base64
import csv
import datetime as dt
import hashlib
import io
import json
import unicodedata
from dataclasses import dataclass
from pathlib import Path

from PIL import Image

from . import commons, render

MIN_SIDE = 120  # px; a logo file smaller than this is too rough to sharpen
MIN_INK = 0.03  # share of the frame the logo must cover, or the grids are all background
MAX_INK = 0.97  # ...and must leave some background, or there's nothing to see

INDUSTRIES = (
    "Tech", "Internet", "Fast food", "Food", "Drinks", "Cars", "Sportswear", "Fashion",
    "Retail", "Media", "Games & toys", "Travel", "Energy", "Finance", "Delivery", "Household",
)


@dataclass
class Brand:
    id: str
    name: str
    wiki: str  # English Wikipedia title, for --check-pool
    file: str  # Commons logo file; blank means guessable but never an answer
    industry: str
    country: str
    founded: int
    wordmark: bool = False  # the logo spells out the name, so it's guessable but never an answer
    aliases: tuple = ()

    @property
    def answerable(self) -> bool:
        return bool(self.file) and not self.wordmark


class Rejected(Exception):
    """The brand's logo can't be used; the scheduler moves on to the next one."""


def load_pool(path: Path):
    with path.open(newline="", encoding="utf-8") as f:
        return [
            Brand(
                r["id"], r["name"], r["wiki"], r["file"].strip(), r["industry"], r["country"], int(r["founded"]),
                r.get("wordmark", "").strip().lower() == "yes",
                tuple(a.strip() for a in (r.get("aliases") or "").split(";") if a.strip()),
            )
            for r in csv.DictReader(f)
        ]


def puzzle_number(date: dt.date, launch: dt.date) -> int:
    return (date - launch).days + 1


def rotation(brands, seed: str):
    """A fixed shuffle of the brands, set by the seed (salted so it differs from the other games')."""
    return sorted(brands, key=lambda b: hashlib.sha256(f"{seed}:logos:{b.id}".encode()).hexdigest())


def answer_pool(brands):
    """The brands that can be a day's answer: a logo file, and no name spelled out in it."""
    return [b for b in brands if b.answerable]


def plain(s: str) -> str:
    s = unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode().lower()
    return " ".join("".join(c if c.isalnum() else " " for c in s).split())


def guess_list(brands):
    """What the game's type-ahead offers: every brand, with what the feedback compares. No answers flagged."""
    return [
        {"id": b.id, "name": b.name, "aliases": list(b.aliases), "industry": b.industry, "country": b.country, "founded": b.founded}
        for b in sorted(brands, key=lambda b: (plain(b.name), b.id))
    ]


def first_letter(name: str) -> str:
    """The first letter or digit of the name, without accents: 'Škoda' -> 'S', '7 Up' -> '7'."""
    p = plain(name)
    return p[:1].upper()


def cache_path(cache_dir: Path, info: commons.FileInfo) -> Path:
    digest = hashlib.sha256(f"{info.name}|{info.thumb_url}".encode()).hexdigest()[:20]
    return cache_dir / "logos" / f"{digest}.img"


def fetch(brand: Brand, cache_dir: Path):
    """The Commons record and logo image for a brand, checked; images are cached by file and rendering."""
    if not brand.file:
        raise Rejected(f"{brand.id}: no logo file in the pool")
    info = commons.file_info([brand.file])[brand.file]
    if info.missing:
        raise Rejected(f"{brand.id}: {brand.file!r} is not on Commons")
    if not info.public_domain:
        raise Rejected(f"{brand.id}: not public domain on Commons ({info.licence or 'no licence'})")
    if not info.thumb_url:
        raise Rejected(f"{brand.id}: Commons has no rendering of {brand.file!r}")

    path = cache_path(cache_dir, info)
    if not path.exists():
        try:
            data = commons.get_bytes(info.thumb_url)
        except commons.Unusable as e:
            raise Rejected(f"{brand.id}: {e}") from e
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(data)
    try:
        img = Image.open(io.BytesIO(path.read_bytes()))
        img.load()
    except OSError as e:
        path.unlink(missing_ok=True)
        raise commons.FetchError(f"{brand.id}: image did not decode ({e})") from e
    return info, img


def prepare(brand: Brand, img: Image.Image):
    """The framed logo and its background colour, after checking it's usable."""
    w, h = img.size
    if max(w, h) < MIN_SIDE:
        raise Rejected(f"{brand.id}: logo is only {w}x{h}")
    flat, bg = render.flatten(img)
    framed = render.frame(flat, bg)
    ink = render.ink_share(framed, bg)
    if not MIN_INK <= ink <= MAX_INK:
        raise Rejected(f"{brand.id}: logo covers {ink:.0%} of its frame")
    return framed, bg


def stages_for(img: Image.Image):
    """The six stage images, as (filename, image bytes, stage description)."""
    files = []
    for i, cells in enumerate(render.GRIDS, start=1):
        grid = render.pixel_grid(img, cells)
        files.append((f"stage{i}.png", render.png_bytes(grid), {"kind": "grid", "grid": list(grid.size)}))
    files.append((f"stage{len(files) + 1}.png", render.png_bytes(render.blurred(img)), {"kind": "blur"}))
    return files


def build_from_image(brand: Brand, img: Image.Image, info: commons.FileInfo, date: dt.date, number: int, out_dir: Path):
    """Write one day's puzzle folder from an image already in hand."""
    framed, bg = prepare(brand, img)
    files = stages_for(framed)
    w, h = framed.size

    secret = {
        "id": brand.id,
        "name": brand.name,
        "industry": brand.industry,
        "country": brand.country,
        "founded": brand.founded,
        "letter": first_letter(brand.name),
        "credit": "Wikimedia Commons",
        "licence": info.licence or "Public domain",
        "source": info.page_url,
    }
    puzzle = {
        "game": "logos",
        "number": number,
        "date": date.isoformat(),
        "aspect": round(w / h, 4),
        "background": render.hex_colour(bg),
        "stages": [{"image": name, **desc} for name, _, desc in files],
        "reveal": "full.png",
        # Lightly encoded so the answer isn't readable at a glance in dev tools.
        "secret": base64.b64encode(json.dumps(secret).encode()).decode(),
    }

    day_dir = out_dir / date.isoformat()
    day_dir.mkdir(parents=True, exist_ok=True)
    for name, data, _ in files:
        (day_dir / name).write_bytes(data)
    (day_dir / "full.png").write_bytes(render.png_bytes(render.reveal(framed)))
    (day_dir / "puzzle.json").write_text(json.dumps(puzzle, separators=(",", ":")))
    return puzzle


def build(brand: Brand, date: dt.date, number: int, out_dir: Path, cache_dir: Path):
    info, img = fetch(brand, cache_dir)
    return build_from_image(brand, img, info, date, number, out_dir)
