import base64
import datetime as dt
import json
import sys
from pathlib import Path

import numpy as np
import pytest
from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from palette_gen import museums, puzzle, render  # noqa: E402
from palette_gen.puzzle import Painting, Rejected  # noqa: E402

POOL = Path(__file__).resolve().parents[1] / "paintings.csv"
GUESS_LIST = Path(__file__).resolve().parents[2] / "web" / "public" / "data" / "paintings.json"

# Five flat colours in known proportions: 40%, 25%, 15%, 12%, 8% of the width.
BANDS = [((20, 40, 90), 40), ((230, 190, 60), 25), ((180, 60, 40), 15), ((235, 225, 200), 12), ((50, 90, 50), 8)]


def synthetic(width=500, height=400):
    """A test card: vertical bands of BANDS, plus a little noise so k-means has work to do."""
    rng = np.random.default_rng(1)
    arr = np.zeros((height, width, 3), dtype=np.float64)
    x = 0
    for rgb, pct in BANDS:
        w = width * pct // 100
        arr[:, x:x + w] = rgb
        x += w
    arr += rng.normal(0, 4, arr.shape)
    return Image.fromarray(np.clip(arr, 0, 255).astype(np.uint8))


def fake_art():
    return museums.Artwork("aic", "1", "Test Card", "Nobody", 1900, True, "x", "https://example.org/1", "Test Museum")


PAINTING = Painting("test-card", "aic", "1", "Test Card", "Ada Q. van Testing", 1888, "Dutch", "Impressionism")


def test_palette_finds_the_bands_in_order():
    colours = render.palette(synthetic())
    assert len(colours) == 5
    for (rgb, share), (want, pct) in zip(colours, BANDS):
        assert np.abs(np.array(rgb) - want).max() <= 3
        assert abs(share - pct / 100) < 0.02


def test_palette_is_deterministic():
    img = synthetic()
    assert render.palette(img) == render.palette(img)


def test_palette_of_a_flat_image_has_one_colour():
    colours = render.palette(Image.new("RGB", (50, 50), (10, 20, 30)))
    assert colours[0] == ((10, 20, 30), 1.0)


def test_stripe_widths_fill_the_strip_and_keep_small_colours_visible():
    widths = render.stripe_widths([0.9, 0.05, 0.03, 0.01, 0.01])
    assert sum(widths) == render.STRIPES_SIZE[0]
    assert min(widths) >= render.MIN_STRIPE
    assert widths == sorted(widths, reverse=True)


def test_stripes_image_starts_with_the_main_colour():
    colours = render.palette(synthetic())
    img = render.stripes(colours)
    assert img.size == render.STRIPES_SIZE
    assert img.getpixel((0, 0)) == colours[0][0]
    assert img.getpixel((render.STRIPES_SIZE[0] - 1, 0)) == colours[-1][0]


def test_grid_shapes_keep_the_aspect():
    assert render.grid_shape((800, 600), 4) == (4, 3)
    assert render.grid_shape((600, 800), 32) == (24, 32)
    assert render.grid_shape((1000, 100), 4) == (4, 1)


def test_pixel_grid_averages_cells():
    img = synthetic(400, 400)
    grid = render.pixel_grid(img, 4)
    assert grid.size == (4, 4)
    # The first cell is all first band (40% wide), so its average is that colour.
    assert np.abs(np.array(grid.getpixel((0, 0))) - BANDS[0][0]).max() <= 2


def test_build_writes_six_stages(tmp_path):
    p = puzzle.build_from_image(PAINTING, synthetic(), fake_art(), dt.date(2026, 10, 20), 3, tmp_path)
    day = tmp_path / "2026-10-20"
    assert p["game"] == "palette" and p["number"] == 3
    assert [s["image"] for s in p["stages"]] == [f"stage{i}.png" for i in range(1, 6)] + ["stage6.jpg"]
    assert [s["kind"] for s in p["stages"]] == ["grid", "grid", "grid", "grid", "blur", "detail"]
    assert [s.get("grid") for s in p["stages"][:4]] == [[12, 10], [20, 16], [32, 26], [48, 38]]
    for s in p["stages"]:
        assert Image.open(day / s["image"]).format == ("JPEG" if s["kind"] == "detail" else "PNG")
        assert (day / s["image"]).stat().st_size < 60_000
    assert max(Image.open(day / "stage6.jpg").size) == render.DETAIL_SIDE
    assert Image.open(day / "full.jpg").size == (500, 400)  # never upscaled
    assert json.loads((day / "puzzle.json").read_text()) == p
    assert len(p["palette"]) == 5

    secret = json.loads(base64.b64decode(p["secret"]))
    assert secret["id"] == "test-card" and secret["initials"] == "A. Q. v. T."
    assert "object_id" not in secret and "famous" not in secret
    assert "Test Card" not in json.dumps({k: v for k, v in p.items() if k != "secret"})


def test_days_before_the_switch_keep_the_original_stages(tmp_path):
    p = puzzle.build_from_image(PAINTING, synthetic(), fake_art(), dt.date(2026, 10, 19), 3, tmp_path)
    day = tmp_path / "2026-10-19"
    assert p["game"] == "palette" and p["number"] == 3
    assert [s["image"] for s in p["stages"]] == [f"stage{i}.png" for i in range(1, 7)]
    assert [s["kind"] for s in p["stages"]] == ["stripes", "grid", "grid", "grid", "grid", "blur"]
    assert [s.get("grid") for s in p["stages"][1:5]] == [[4, 3], [8, 6], [16, 13], [32, 26]]
    for s in p["stages"]:
        assert Image.open(day / s["image"]).format == "PNG"
        assert (day / s["image"]).stat().st_size < 60_000
    assert Image.open(day / "full.jpg").size == (500, 400)  # never upscaled
    assert json.loads((day / "puzzle.json").read_text()) == p
    main = bytes.fromhex(p["palette"][0]["hex"][1:])
    assert max(abs(a - b) for a, b in zip(main, BANDS[0][0])) <= 3

    secret = json.loads(base64.b64decode(p["secret"]))
    assert secret["id"] == "test-card" and secret["initials"] == "A. Q. v. T."
    assert secret["source"] == "https://example.org/1" and "object_id" not in secret
    assert "Test Card" not in json.dumps({k: v for k, v in p.items() if k != "secret"})


def test_build_rejects_unusable_images(tmp_path):
    with pytest.raises(Rejected):
        puzzle.build_from_image(PAINTING, synthetic(200, 150), fake_art(), dt.date(2026, 10, 20), 1, tmp_path)
    with pytest.raises(Rejected):
        puzzle.build_from_image(PAINTING, synthetic(1500, 400), fake_art(), dt.date(2026, 10, 20), 1, tmp_path)
    with pytest.raises(Rejected):
        puzzle.build_from_image(PAINTING, synthetic().convert("L").convert("RGB"), fake_art(), dt.date(2026, 10, 20), 1, tmp_path)


def test_artist_match_guards_against_wrong_ids():
    assert museums.artist_matches("Vincent van Gogh", "Vincent van Gogh")
    assert museums.artist_matches("El Greco", "El Greco (Domenikos Theotokopoulos)")
    assert museums.artist_matches("Pieter Bruegel the Elder", "Pieter Bruegel the Elder")
    assert museums.artist_matches("Georges de La Tour", "Georges de La Tour")
    assert museums.artist_matches("Paul Cézanne", "Paul Cezanne")
    assert not museums.artist_matches("John Singer Sargent", "John Constable")
    assert not museums.artist_matches("Claude Monet", "")


def test_pool_is_unique_and_complete():
    pool = puzzle.load_pool(POOL)
    assert len(pool) >= 150
    assert len({p.id for p in pool}) == len(pool)
    assert len({museums.plain(p.title + p.artist) for p in pool}) == len(pool)
    for p in pool:
        assert p.museum in museums.MUSEUMS and p.object_id.isdigit(), p.id
        assert 1200 < p.year < 1930 and p.nationality and p.movement, p.id


def test_guess_list_matches_the_pool():
    # Regenerate with: python generator/generate_palette.py --guess-list web/public/data/paintings.json
    assert json.loads(GUESS_LIST.read_text()) == puzzle.guess_list(puzzle.load_pool(POOL))


def test_rotation_is_stable_and_salted():
    pool = puzzle.load_pool(POOL)
    assert [p.id for p in puzzle.rotation(pool, "a")] == [p.id for p in puzzle.rotation(pool, "a")]
    assert [p.id for p in puzzle.rotation(pool, "a")] != [p.id for p in puzzle.rotation(pool, "b")]


def test_fallback_moves_to_the_next_painting(tmp_path, monkeypatch):
    import generate_palette

    pool = puzzle.load_pool(POOL)[:5]
    order = puzzle.rotation(pool, "seed")
    tried = []

    def fake_build(painting, date, number, out, cache):
        tried.append(painting.id)
        if painting.id == order[1].id:
            raise Rejected("not public domain")

    monkeypatch.setattr(generate_palette, "build", fake_build)
    launch = dt.date(2026, 10, 18)
    generate_palette.generate_day(dt.date(2026, 10, 19), pool, launch, "seed", tmp_path, tmp_path)
    assert tried == [order[1].id, order[2].id]

    tried.clear()
    generate_palette.generate_day(dt.date(2026, 10, 18), pool, launch, "seed", tmp_path, tmp_path)
    assert tried == [order[0].id]


def test_every_painting_rejected_fails_the_day(tmp_path, monkeypatch):
    import generate_palette

    def reject(*args):
        raise Rejected("no")

    monkeypatch.setattr(generate_palette, "build", reject)
    pool = puzzle.load_pool(POOL)[:3]
    with pytest.raises(SystemExit):
        generate_palette.generate_day(dt.date(2026, 10, 19), pool, dt.date(2026, 10, 18), "seed", tmp_path, tmp_path)


def test_rejection_for_wrong_artist(tmp_path, monkeypatch):
    art = museums.Artwork("aic", "1", "Other", "Someone Else", 1900, True, "x", "u", "Test Museum")
    monkeypatch.setattr(museums, "fetch_artwork", lambda m, i: art)
    with pytest.raises(Rejected, match="not"):
        puzzle.fetch(PAINTING, tmp_path)
    art.artist, art.public_domain = "Ada van Testing", False
    with pytest.raises(Rejected, match="public domain"):
        puzzle.fetch(PAINTING, tmp_path)


def test_famous_answer_pool_from_the_switch():
    pool = puzzle.load_pool(POOL)
    famous = [p for p in pool if p.famous]
    assert 30 <= len(famous) <= 60
    before = puzzle.EASIER_FROM - dt.timedelta(days=1)
    assert puzzle.answer_pool(pool, before) == pool
    assert puzzle.answer_pool(pool, puzzle.EASIER_FROM) == famous
    # Guessable options never shrink, and the guess list doesn't reveal which are answers.
    assert len(puzzle.guess_list(pool)) == len(pool)
    assert all("famous" not in g for g in puzzle.guess_list(pool))


def test_schedule_uses_the_famous_pool_from_the_switch(tmp_path, monkeypatch):
    import generate_palette

    pool = puzzle.load_pool(POOL)
    picked = {}

    def fake_build(painting, date, number, out, cache):
        picked[date] = painting

    monkeypatch.setattr(generate_palette, "build", fake_build)
    launch = dt.date(2026, 10, 18)
    for d in range(40):
        generate_palette.generate_day(launch + dt.timedelta(days=d), pool, launch, "seed", tmp_path, tmp_path)
    old = puzzle.rotation(pool, "seed")
    assert picked[launch] == old[0] and picked[launch + dt.timedelta(days=1)] == old[1]
    assert all(p.famous for date, p in picked.items() if date >= puzzle.EASIER_FROM)
    # Every run agrees on the answer.
    again = {}
    monkeypatch.setattr(generate_palette, "build", lambda painting, date, *a: again.__setitem__(date, painting))
    for date in picked:
        generate_palette.generate_day(date, pool, launch, "seed", tmp_path, tmp_path)
    assert again == picked
