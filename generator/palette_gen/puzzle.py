"""Build one day's Palette puzzle: pick a painting, fetch it, render six stages."""

import base64
import csv
import datetime as dt
import hashlib
import io
import json
from dataclasses import asdict, dataclass
from pathlib import Path

from PIL import Image

from . import museums, render

MIN_SIDE = 400  # px; anything smaller is a thumbnail, not a painting
MAX_ASPECT = 2.6  # wider or taller than this makes a poor frame
MIN_COLOURFULNESS = 12  # near-greyscale images make the palette stage pointless

# From this day on, answers come only from the paintings marked famous in the pool
# (every painting stays guessable) and the stages start from a recognisable pixel grid.
# Earlier days keep the original rotation and stages, so published puzzles never change.
EASIER_FROM = dt.date(2026, 10, 20)


@dataclass
class Painting:
    id: str
    museum: str
    object_id: str
    title: str
    artist: str
    year: int
    nationality: str
    movement: str
    famous: bool = False  # in the answer pool from EASIER_FROM; never sent to the browser


class Rejected(Exception):
    """The painting can't be used; the scheduler moves on to the next one."""


def load_pool(path: Path):
    with path.open(newline="", encoding="utf-8") as f:
        return [
            Painting(
                r["id"], r["museum"], r["object_id"], r["title"], r["artist"], int(r["year"]), r["nationality"], r["movement"],
                r.get("famous", "").strip().lower() == "yes",
            )
            for r in csv.DictReader(f)
        ]


def puzzle_number(date: dt.date, launch: dt.date) -> int:
    return (date - launch).days + 1


def rotation(paintings, seed: str):
    """A fixed shuffle of the pool, set by the seed (salted so it differs from Contour's)."""
    return sorted(paintings, key=lambda p: hashlib.sha256(f"{seed}:palette:{p.id}".encode()).hexdigest())


def easier(date: dt.date) -> bool:
    return date >= EASIER_FROM


def answer_pool(paintings, date: dt.date):
    """The paintings that can be a given day's answer."""
    return [p for p in paintings if p.famous] if easier(date) else list(paintings)


def initials(artist: str) -> str:
    """'Vincent van Gogh' -> 'V. v. G.', keeping particles lowercase as the name has them."""
    return " ".join(f"{w[0]}." for w in artist.replace("-", " ").split())


def guess_list(paintings):
    """What the game's type-ahead offers: every painting in the pool, no answers flagged."""
    return [
        {"id": p.id, "title": p.title, "artist": p.artist, "year": p.year, "nationality": p.nationality, "movement": p.movement}
        for p in sorted(paintings, key=lambda p: (museums.plain(p.title), p.id))
    ]


def fetch(painting: Painting, cache_dir: Path):
    """The museum record and image for a painting, checked; images are cached by object ID."""
    try:
        art = museums.fetch_artwork(painting.museum, painting.object_id)
    except museums.Unusable as e:
        raise Rejected(f"{painting.id}: {e}") from e
    if not art.public_domain:
        raise Rejected(f"{painting.id}: not public domain at {painting.museum}")
    if not art.image_url:
        raise Rejected(f"{painting.id}: no image at {painting.museum}")
    if not museums.artist_matches(painting.artist, art.artist):
        raise Rejected(f"{painting.id}: {painting.museum}:{painting.object_id} is by {art.artist!r}, not {painting.artist!r}")

    path = cache_dir / "palette" / f"{painting.museum}-{painting.object_id}.jpg"
    if not path.exists():
        try:
            data = museums.get_bytes(art.image_url)
        except museums.Unusable as e:
            raise Rejected(f"{painting.id}: {e}") from e
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(data)
    try:
        img = Image.open(io.BytesIO(path.read_bytes()))
        img.load()
    except OSError as e:
        path.unlink(missing_ok=True)
        raise museums.FetchError(f"{painting.id}: image did not decode ({e})") from e
    return art, img.convert("RGB")


def check(painting: Painting, img: Image.Image):
    w, h = img.size
    if max(w, h) < MIN_SIDE:
        raise Rejected(f"{painting.id}: image is only {w}x{h}")
    if max(w, h) / min(w, h) > MAX_ASPECT:
        raise Rejected(f"{painting.id}: image is {w}x{h}, too far from a frame shape")
    if render.colourfulness(img) < MIN_COLOURFULNESS:
        raise Rejected(f"{painting.id}: image is nearly greyscale")


def stages_for(img: Image.Image, easy: bool = True):
    """The six stage images, as (filename, image bytes, stage description), plus the palette."""
    colours = render.palette(img)
    if easy:
        files = []
        for i, cells in enumerate(render.GRIDS, start=1):
            grid = render.pixel_grid(img, cells)
            files.append((f"stage{i}.png", render.png_bytes(grid), {"kind": "grid", "grid": list(grid.size)}))
        files.append(("stage5.png", render.png_bytes(render.blurred(img)), {"kind": "blur"}))
        files.append(("stage6.jpg", render.jpeg_bytes(render.detail(img)), {"kind": "detail"}))
        return files, colours
    files = [("stage1.png", render.png_bytes(render.stripes(colours)), {"kind": "stripes"})]
    for i, cells in enumerate(render.LEGACY_GRIDS, start=2):
        grid = render.pixel_grid(img, cells)
        files.append((f"stage{i}.png", render.png_bytes(grid), {"kind": "grid", "grid": list(grid.size)}))
    files.append((f"stage{len(files) + 1}.png", render.png_bytes(render.blurred(img)), {"kind": "blur"}))
    return files, colours


def build_from_image(painting: Painting, img: Image.Image, art: museums.Artwork, date: dt.date, number: int, out_dir: Path):
    """Write one day's puzzle folder from an image already in hand."""
    check(painting, img)
    files, colours = stages_for(img, easy=easier(date))
    w, h = img.size

    secret = {
        **asdict(painting),
        "initials": initials(painting.artist),
        "credit": art.credit,
        "source": art.page_url,
    }
    del secret["object_id"], secret["famous"]
    puzzle = {
        "game": "palette",
        "number": number,
        "date": date.isoformat(),
        "aspect": round(w / h, 4),
        "palette": [{"hex": render.hex_colour(rgb), "share": round(share, 3)} for rgb, share in colours],
        "stages": [{"image": name, **desc} for name, _, desc in files],
        "reveal": "full.jpg",
        # Lightly encoded so the answer isn't readable at a glance in dev tools.
        "secret": base64.b64encode(json.dumps(secret).encode()).decode(),
    }

    day_dir = out_dir / date.isoformat()
    day_dir.mkdir(parents=True, exist_ok=True)
    for name, data, _ in files:
        (day_dir / name).write_bytes(data)
    (day_dir / "full.jpg").write_bytes(render.jpeg_bytes(render.reveal(img)))
    (day_dir / "puzzle.json").write_text(json.dumps(puzzle, separators=(",", ":")))
    return puzzle


def build(painting: Painting, date: dt.date, number: int, out_dir: Path, cache_dir: Path):
    art, img = fetch(painting, cache_dir)
    return build_from_image(painting, img, art, date, number, out_dir)
