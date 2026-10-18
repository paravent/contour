import base64
import datetime as dt
import io
import json
import math
import sys
from pathlib import Path

import numpy as np
import pytest
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from contour_gen import geo  # noqa: E402
from night_lights import gibs  # noqa: E402
from night_lights.puzzle import (  # noqa: E402
    MAX_IMAGE_BYTES, SIZE, STAGE_WIDTHS_KM, City, Rejected, build, candidates, check_lit, city_list,
    encode_jpeg, fallback_stride, glow, jitter, load_cities, load_country_names, luminance, rotation,
)

CITIES = ROOT / "cities.csv"
COUNTRIES = ROOT.parent / "web" / "public" / "data" / "countries.json"


def synthetic_fetch(lights):
    """A fake GIBS: tiles drawn from Gaussian 'cities' at (lon, lat, radius_km), clearly not real data."""

    def fetch(url):
        z, y, x = (int(p) for p in url.rsplit(".", 1)[0].split("/")[-3:])
        gy, gx = np.mgrid[0:256, 0:256].astype(np.float64)
        gx += x * 256 + 0.5
        gy += y * 256 + 0.5
        lum = np.full((256, 256), 6.0)
        for lon, lat, r_km in lights:
            cx, cy = geo.lonlat_to_px(lon, lat, z)
            # Wrap so a light near the antimeridian shows on both sides.
            dx = (gx - cx + 128 * 2**z) % (256 * 2**z) - 128 * 2**z
            r_px = r_km * 1000 / geo.metres_per_px(lat, z)
            lum += 250 * np.exp(-(dx**2 + (gy - cy) ** 2) / (2 * max(r_px, 0.6) ** 2))
        v = np.clip(lum, 0, 255).astype(np.uint8)
        buf = io.BytesIO()
        Image.fromarray(np.stack([v, v, (v * 0.8).astype(np.uint8)], -1)).save(buf, format="PNG")
        return buf.getvalue()

    return fetch


def test_tile_url_puts_row_before_column():
    url = gibs.TILE_URL.format(z=8, x=11, y=22)
    assert url.endswith("/VIIRS_Black_Marble/default/2016-01-01/GoogleMapsCompatible_Level8/8/22/11.png")


def test_pick_zoom_gives_enough_pixels_and_respects_max():
    for lat in (0, 35, 60):
        for w in STAGE_WIDTHS_KM:
            z = gibs.pick_zoom(lat, w, SIZE)
            assert 0 <= z <= gibs.MAX_ZOOM
            side = w * 1000 / geo.metres_per_px(lat, z)
            assert side >= SIZE or z == gibs.MAX_ZOOM
            if z > 0:  # one zoom lower would not have been enough
                assert w * 1000 / geo.metres_per_px(lat, z - 1) < SIZE


@pytest.mark.parametrize("lon,lat", [(2.35, 48.86), (-157.86, 21.31), (179.9, -16.0), (-58.38, -34.6)])
@pytest.mark.parametrize("width", [50, 500, 2000])
def test_mosaic_puts_a_light_where_it_belongs(tmp_path, lon, lat, width):
    cache = gibs.TileCache(tmp_path, fetch=synthetic_fetch([(lon, lat, width / 60)]))
    view = gibs.load_view(cache, lon + 0.1 * width / 111, lat - 0.05 * width / 111, width, 256)
    assert view.rgb.shape == (256, 256, 3)
    lum = luminance(view.rgb)
    y, x = np.unravel_index(np.argmax(lum), lum.shape)
    fx, fy = view.locate(lon, lat)
    assert abs(x / 256 - fx) < 0.02 and abs(y / 256 - fy) < 0.02
    b = view.bounds()
    assert b["west"] < lon + 360 * (lon < b["west"] - 180) and b["south"] < lat < b["north"]


def test_tile_cache_rejects_error_pages(tmp_path):
    cache = gibs.TileCache(tmp_path, fetch=lambda url: b"<ExceptionReport/>")
    with pytest.raises(Exception):
        cache.get(3, 1, 2)
    assert not any(tmp_path.rglob("*.png"))


def test_darkness_check():
    dark = np.full((100, 100), 10.0)
    with pytest.raises(Rejected, match="lit"):
        check_lit(dark, 0.5, 0.5, "x")
    lit = dark.copy()
    lit[30:70, 30:70] = 200
    assert check_lit(lit, 0.5, 0.5, "x") == pytest.approx(0.16)
    with pytest.raises(Rejected, match="dark"):
        check_lit(lit, 0.9, 0.9, "x")  # lights nearby, but not at the city


def test_glow_is_gold_on_black():
    rgb = np.array([[[0, 0, 0], [12, 14, 20], [120, 110, 80], [255, 255, 255]]], dtype=np.uint8)
    out = glow(rgb).astype(int)
    assert out[0, 0].max() <= 12
    r, g, b = out[0, 2]
    assert r > g > b and r > 120
    assert out[0, 3].min() > 200


def test_jpeg_fits_the_size_limit():
    noisy = np.random.default_rng(1).integers(0, 255, (SIZE, SIZE, 3), dtype=np.uint8)
    data = encode_jpeg(glow(noisy))
    assert len(data) <= MAX_IMAGE_BYTES and data[:2] == b"\xff\xd8"


def test_build_writes_six_stages_with_the_answer_off_centre(tmp_path):
    city = City("testville", "Testville", "FRA", 45.0, 5.0, [])
    # A big glow on the city plus satellite towns, so every stage has something to show.
    lights = [(5.0, 45.0, 6), (5.6, 45.3, 3), (4.2, 44.6, 4), (8.0, 47.0, 15)]
    tiles = gibs.TileCache(tmp_path / "tiles", fetch=synthetic_fetch(lights))
    date = dt.date(2026, 10, 20)
    puzzle, stats = build(city, "France", date, 3, "seed", tmp_path / "out", tiles)

    day = tmp_path / "out" / "2026-10-20"
    assert sorted(p.name for p in day.iterdir()) == ["puzzle.json"] + [f"stage{i}.jpg" for i in range(1, 7)]
    assert json.loads((day / "puzzle.json").read_text()) == puzzle
    assert [s["widthKm"] for s in puzzle["stages"]] == STAGE_WIDTHS_KM
    for s in puzzle["stages"]:
        assert (day / s["image"]).stat().st_size <= MAX_IMAGE_BYTES
        assert Image.open(day / s["image"]).size == (SIZE, SIZE)
    secret = json.loads(base64.b64decode(puzzle["secret"]))
    assert secret == {"cityId": "testville", "city": "Testville", "country": "FRA", "countryName": "France",
                      "lat": 45.0, "lon": 5.0, "letter": "T"}
    assert stats["lit"] > 0.06

    # The glow peak in stage 1 sits at the jittered spot, not the centre.
    fx, fy = jitter("seed", date)
    lum = luminance(np.asarray(Image.open(day / "stage1.jpg").convert("RGB")))
    ys, xs = np.nonzero(lum >= lum.max() - 4)  # centre of the saturated core
    y, x = ys.mean(), xs.mean()
    assert abs(x / SIZE - (0.5 + fx)) < 0.03 and abs(y / SIZE - (0.5 + fy)) < 0.03


def test_build_rejects_a_dark_city(tmp_path):
    city = City("darkville", "Darkville", "FRA", 45.0, 5.0, [])
    tiles = gibs.TileCache(tmp_path, fetch=synthetic_fetch([(30.0, 10.0, 5)]))
    with pytest.raises(Rejected):
        build(city, "France", dt.date(2026, 10, 20), 3, "seed", tmp_path / "out", tiles)


def test_cities_are_unique_valid_and_exported():
    cities = load_cities(CITIES)
    names = load_country_names(COUNTRIES)
    assert len(cities) >= 200
    assert len({c.id for c in cities}) == len(cities)
    assert len({c.name for c in cities}) == len(cities)
    for c in cities:
        assert -60 < c.lat < 70 and -180 <= c.lon <= 180, c.id
        assert c.country in names, c.id
    exported = json.loads((ROOT.parent / "web" / "public" / "data" / "cities.json").read_text())
    assert exported == city_list(cities, names), "run generate_night_lights.py --export-cities web/public/data/cities.json"


def test_schedule_tries_every_city_and_skips_far_ahead():
    cities = load_cities(CITIES)
    order = rotation(cities, "a")
    assert [c.id for c in order] == [c.id for c in rotation(cities, "a")]
    assert [c.id for c in order] != [c.id for c in rotation(cities, "b")]
    tries = candidates(order, 5)
    assert tries[0] is order[4] and len({c.id for c in tries}) == len(cities)
    # A rejected city doesn't hand the day to the next few days' answers.
    assert all(tries[1] is not order[4 + d] for d in range(1, 30))
    assert math.gcd(fallback_stride(len(cities)), len(cities)) == 1


def test_jitter_differs_from_contour():
    from contour_gen.puzzle import jitter as contour_jitter
    d = dt.date(2026, 10, 18)
    assert jitter("s", d) != contour_jitter("s", d)
    assert all(abs(v) <= 0.22 for v in jitter("s", d))
