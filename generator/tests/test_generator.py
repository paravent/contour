import datetime as dt
import re
import sys
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from contour_gen import geo  # noqa: E402
from contour_gen import countries  # noqa: E402
from contour_gen.puzzle import EASIER_FROM, LEGACY_STAGES, STAGES, jitter, load_places, puzzle_number, rotation, stages_for  # noqa: E402
from contour_gen.puzzle import MAX_SVG_BYTES  # noqa: E402
from contour_gen.render import (  # noqa: E402
    AMBER, MAGENTA, RAMP, _simplify, contour_interval, elevation_range, legend, ramp_color, ramp_position, render_svg,
)
from contour_gen.terrain import GRID, View  # noqa: E402

PLACES = Path(__file__).resolve().parents[1] / "places.csv"


def test_mercator_round_trip():
    x, y = geo.lonlat_to_px(7.66, 45.98, 12)
    lon, lat = geo.px_to_lonlat(x, y, 12)
    assert abs(lon - 7.66) < 1e-9 and abs(lat - 45.98) < 1e-9


def test_haversine():
    assert abs(geo.haversine_km(51.5074, -0.1278, 48.8566, 2.3522) - 344) < 2


def test_places_are_unique_and_valid():
    places = load_places(PLACES)
    assert len({p.id for p in places}) == len(places)
    for p in places:
        assert -85 < p.lat < 85 and -180 <= p.lon <= 180, p.id
        assert len(p.country) == 3, p.id


def test_rotation_is_stable_for_a_seed():
    places = load_places(PLACES)
    assert [p.id for p in rotation(places, "a")] == [p.id for p in rotation(places, "a")]
    assert [p.id for p in rotation(places, "a")] != [p.id for p in rotation(places, "b")]


def test_jitter_keeps_answer_inside_every_view():
    for d in range(60):
        fx, fy = jitter("seed", dt.date(2026, 1, 1) + dt.timedelta(days=d))
        assert abs(fx) <= 0.22 and abs(fy) <= 0.22


def test_puzzle_number():
    assert puzzle_number(dt.date(2026, 10, 18), dt.date(2026, 10, 18)) == 1
    assert puzzle_number(dt.date(2026, 11, 18), dt.date(2026, 10, 18)) == 32


def test_contour_interval_keeps_lines_readable():
    elevation = np.linspace(0, 4000, 100).reshape(10, 10)
    for spec in STAGES + LEGACY_STAGES:
        step = contour_interval(elevation, spec["max_lines"])
        assert 4000 / step <= spec["max_lines"]
    assert contour_interval(np.full((4, 4), -10.0)) is None


def test_simplify_drops_collinear_points():
    line = np.array([[0, 0], [1, 0.01], [2, 0], [3, 0], [3, 5]], dtype=float)
    assert _simplify(line, 0.5).tolist() == [[0, 0], [3, 0], [3, 5]]


def test_stages_switch_to_the_wider_start_on_the_day():
    assert stages_for(EASIER_FROM - dt.timedelta(days=1)) is LEGACY_STAGES
    assert stages_for(EASIER_FROM) is STAGES
    assert len(STAGES) == len(LEGACY_STAGES) == 6
    widths = [s["width_km"] for s in STAGES]
    assert widths == sorted(widths) and 30 <= widths[0] <= 50
    # The pin map is the last stage; keep it the same size so pin scores stay comparable.
    assert widths[-1] == LEGACY_STAGES[-1]["width_km"]
    assert STAGES[0]["coast"] and STAGES[1]["sea"]
    for new, old in zip(STAGES, LEGACY_STAGES):
        assert new["width_km"] >= old["width_km"]
        for clue in ("coast", "sea", "borders"):
            assert new[clue] >= old[clue]


def test_continents_skip_open_ocean():
    def feature(code, continent):
        return {"properties": {"ADM0_A3": code, "CONTINENT": continent}}

    got = countries.continents([feature("FRA", "Europe"), feature("MDV", "Seven seas (open ocean)")])
    assert got == {"FRA": "Europe", "MDV": ""}


def _synthetic_view(peak=1200.0, sea=True):
    axis = np.linspace(-1, 1, GRID)
    x, y = np.meshgrid(axis, axis)
    z = peak * np.exp(-(x ** 2 + y ** 2) * 3) + (np.where(x + y > 1.2, -50.0, 20.0) if sea else 50.0)
    return View(zoom=10, left=0.0, top=0.0, side=1000.0, elevation=z)


def test_ramp_runs_from_lowland_teal_to_pale_peaks():
    assert RAMP[0][0] == 0.0 and RAMP[-1][0] == 1.0
    assert [t for t, _ in RAMP] == sorted(t for t, _ in RAMP)
    assert ramp_color(0.0) == RAMP[0][1]
    assert ramp_color(1.0) == RAMP[-1][1]
    assert ramp_color(-1) == ramp_color(0.0) and ramp_color(2) == ramp_color(1.0)
    # The ramp never lands on the coast's magenta or the borders' amber.
    for i in range(101):
        assert ramp_color(i / 100) not in (MAGENTA.upper(), AMBER.upper())
    assert ramp_position(0, 0, 1000) == 0 and ramp_position(1000, 0, 1000) == 1
    assert ramp_position(100, 0, 1000) > 0.1  # low ground still gets a spread of colours


def test_elevation_range_spans_every_view_of_the_day():
    low_view, high_view = _synthetic_view(300), _synthetic_view(3000, sea=False)
    low, high = elevation_range(low_view.elevation, high_view.elevation)
    assert low == 0  # one view has sea, so the scale starts at sea level
    assert high >= 3000
    plateau = np.full((8, 8), 4000.0) + np.arange(64).reshape(8, 8)
    assert elevation_range(plateau) == (4000, 4063)
    assert elevation_range(np.full((4, 4), -10.0)) is None
    lg = legend(0, 2500)
    assert lg["minM"] == 0 and lg["maxM"] == 2500 and len(lg["colors"]) >= 2


def test_contours_are_coloured_by_height_on_the_days_scale():
    view = _synthetic_view(1200)
    svg = render_svg(view, coast=True, sea=True, heights=(0, 1200))
    colours = re.findall(r'<path stroke="(#[0-9A-F]{6})"', svg)
    assert len(set(colours)) >= 5  # one colour per height
    # The same view on a taller day's scale sits lower on the ramp: same height, same colour all day.
    taller = render_svg(view, coast=True, sea=True, heights=(0, 4000))
    assert re.findall(r'<path stroke="(#[0-9A-F]{6})"', taller) != colours
    assert MAGENTA in svg  # the coastline keeps its own colour
    assert len(svg.encode()) < MAX_SVG_BYTES
