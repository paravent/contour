import base64
import datetime as dt
import json
import sys
from pathlib import Path

import numpy as np
import pytest
from PIL import Image, ImageDraw

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from logos_gen import commons, puzzle, render  # noqa: E402
from logos_gen.puzzle import Brand, Rejected  # noqa: E402

POOL = Path(__file__).resolve().parents[1] / "brands.csv"
GUESS_LIST = Path(__file__).resolve().parents[2] / "web" / "public" / "data" / "brands.json"

BRAND = Brand("test-co", "Test Co", "Test Co", "Q1", "Test co logo.svg", "Tech", "Japan", 1976)
INFO = commons.FileInfo("Test co logo.svg", licence="Public domain", licence_code="pd", thumb_url="https://upload.example/x.png")


def logo(width=960, height=400, ink=(200, 30, 40, 255), transparent=True):
    """A test logo: a disc and a bar on a transparent (or white) canvas."""
    img = Image.new("RGBA", (width, height), (0, 0, 0, 0) if transparent else (255, 255, 255, 255))
    d = ImageDraw.Draw(img)
    d.ellipse((width * 0.1, height * 0.15, width * 0.4, height * 0.85), fill=ink)
    d.rectangle((width * 0.5, height * 0.4, width * 0.9, height * 0.6), fill=(20, 20, 20, 255) if ink[0] < 240 else ink)
    return img


# ---- licences and Commons responses ----

def test_only_public_domain_and_cc0_pass():
    assert commons.is_public_domain("pd", "Public domain")
    assert commons.is_public_domain("", "PD-textlogo")
    assert commons.is_public_domain("cc0", "CC0")
    assert not commons.is_public_domain("cc-by-sa-4.0", "CC BY-SA 4.0")
    assert not commons.is_public_domain("cc-by-3.0", "CC BY 3.0")
    assert not commons.is_public_domain("", "")


def test_file_info_parses_licence_size_and_missing_files():
    payload = {"query": {
        "normalized": [{"from": "File:Test_co_logo.svg", "to": "File:Test co logo.svg"}],
        "pages": [
            {"title": "File:Test co logo.svg", "imageinfo": [{
                "url": "https://upload.wikimedia.org/a/Test_co_logo.svg", "thumburl": "https://upload.wikimedia.org/thumb/960px.png",
                "width": 512, "height": 200, "mime": "image/svg+xml",
                "extmetadata": {"License": {"value": "pd"}, "LicenseShortName": {"value": "Public domain"}},
            }]},
            {"title": "File:Gone.png", "missing": True},
            {"title": "File:Shared.svg", "imageinfo": [{
                "url": "u", "width": 10, "height": 10,
                "extmetadata": {"License": {"value": "cc-by-sa-4.0"}, "LicenseShortName": {"value": "CC BY-SA 4.0"}},
            }]},
        ],
    }}
    info = commons.parse_file_info(payload, ["Test_co_logo.svg", "Gone.png", "Shared.svg", "Never asked.svg"])
    ok = info["Test_co_logo.svg"]
    assert ok.public_domain and not ok.missing and ok.width == 512
    assert ok.thumb_url.endswith("960px.png") and ok.licence == "Public domain"
    assert ok.page_url == "https://commons.wikimedia.org/wiki/File:Test_co_logo.svg"
    assert info["Gone.png"].missing
    assert not info["Shared.svg"].public_domain and info["Shared.svg"].thumb_url == "u"
    assert info["Never asked.svg"].missing


def test_file_keys_compare_like_commons():
    assert commons.file_key("File:apple_logo.svg") == "Apple logo.svg"
    assert commons.page_url("Nestlé logo.svg") == "https://commons.wikimedia.org/wiki/File:Nestl%C3%A9_logo.svg"


def test_wikidata_entity_prefers_current_preferred_values():
    def claim(value, rank="normal", ended=False):
        c = {"rank": rank, "mainsnak": {"datavalue": {"value": value}}}
        if ended:
            c["qualifiers"] = {"P582": [{}]}
        return c

    entity = {"id": "Q1", "labels": {"en": {"value": "Test Co"}}, "descriptions": {"en": {"value": "maker of tests"}}, "claims": {
        "P154": [claim("Old logo.svg", ended=True), claim("Logo.svg"), claim("Best logo.svg", "preferred"), claim("Bad.svg", "deprecated")],
        "P571": [claim({"time": "+1976-04-01T00:00:00Z"}), claim({"time": "+1977-00-00T00:00:00Z"})],
        "P17": [claim({"id": "Q30"})],
        "P495": [claim({"id": "Q30"}), claim({"id": "Q17"})],
    }}
    e = commons.parse_entity(entity)
    assert e.qid == "Q1" and e.label == "Test Co"
    assert e.logos == ("Best logo.svg", "Logo.svg")
    assert e.inception == 1976
    assert e.countries == ("Q30", "Q17")


# ---- rendering ----

def test_background_is_white_for_dark_logos_and_dark_for_white_ones():
    assert render.background_for(logo())[0] == render.LIGHT
    assert render.background_for(logo(ink=(255, 255, 255, 255)))[0] == render.DARK
    opaque = Image.new("RGB", (300, 200), (200, 0, 0))
    ImageDraw.Draw(opaque).rectangle((100, 50, 200, 150), fill=(255, 255, 255))
    assert render.background_for(opaque) == ((200, 0, 0), True)


def test_frame_trims_pads_and_clamps_the_aspect():
    flat, bg = render.flatten(logo(960, 240))
    framed = render.frame(flat, bg)
    w, h = framed.size
    assert w / h == pytest.approx(render.MAX_ASPECT, abs=0.01)
    box = render.ink_box(framed, bg)
    # The ink is centred, with at least the margin on each side.
    assert box[0] >= render.MARGIN * (box[2] - box[0]) - 1
    assert abs(box[0] - (w - box[2])) <= 2 and abs(box[1] - (h - box[3])) <= 2

    tall, bg = render.flatten(logo(200, 600))
    assert render.frame(tall, bg).size[0] == render.frame(tall, bg).size[1]


def test_build_writes_six_stages(tmp_path):
    p = puzzle.build_from_image(BRAND, logo(), INFO, dt.date(2026, 10, 21), 4, tmp_path)
    day = tmp_path / "2026-10-21"
    assert p["game"] == "logos" and p["number"] == 4 and p["background"] == "#FFFFFF"
    assert [s["image"] for s in p["stages"]] == [f"stage{i}.png" for i in range(1, 7)]
    assert [s["kind"] for s in p["stages"]] == ["grid"] * 5 + ["blur"]
    long_side = [max(s["grid"]) for s in p["stages"][:5]]
    assert long_side == list(render.GRIDS)
    for s in p["stages"]:
        assert Image.open(day / s["image"]).format == "PNG"
        assert (day / s["image"]).stat().st_size < 40_000
    assert Image.open(day / "stage1.png").size == tuple(p["stages"][0]["grid"])
    assert max(Image.open(day / "full.png").size) <= render.REVEAL_SIDE
    assert json.loads((day / "puzzle.json").read_text()) == p

    secret = json.loads(base64.b64decode(p["secret"]))
    assert secret["id"] == "test-co" and secret["letter"] == "T" and secret["founded"] == 1976
    assert secret["source"].startswith("https://commons.wikimedia.org/wiki/File:")
    assert "wordmark" not in secret and "file" not in secret
    public = json.dumps({k: v for k, v in p.items() if k != "secret"}).lower()
    assert "test co" not in public and "test-co" not in public


def test_first_stage_is_a_coarse_grid_in_the_logo_colours(tmp_path):
    p = puzzle.build_from_image(BRAND, logo(), INFO, dt.date(2026, 10, 21), 4, tmp_path)
    assert p["stages"][0]["grid"] == [8, 4]
    px = np.asarray(Image.open(tmp_path / "2026-10-21" / "stage1.png").convert("RGB"), dtype=int).reshape(-1, 3)
    # Some cell is clearly red: the colour survives even the coarsest grid.
    assert ((px[:, 0] - px[:, 1] > 60) & (px[:, 0] > 150)).any()


def test_unusable_logos_are_rejected():
    with pytest.raises(Rejected, match="only"):
        puzzle.prepare(BRAND, logo(100, 40))
    with pytest.raises(Rejected, match="covers"):
        puzzle.prepare(BRAND, Image.new("RGBA", (400, 400), (0, 0, 0, 0)))


def test_fetch_rejects_missing_and_non_free_files(tmp_path, monkeypatch):
    infos = {"missing": commons.FileInfo(BRAND.file, missing=True),
             "shared": commons.FileInfo(BRAND.file, licence="CC BY-SA 4.0", licence_code="cc-by-sa-4.0", thumb_url="x")}
    for key, match in (("missing", "not on Commons"), ("shared", "not public domain")):
        monkeypatch.setattr(commons, "file_info", lambda names, info=infos[key]: {names[0]: info})
        with pytest.raises(Rejected, match=match):
            puzzle.fetch(BRAND, tmp_path)
    with pytest.raises(Rejected, match="no logo file"):
        puzzle.fetch(Brand("x", "X", "X", "", "", "Tech", "Japan", 2000), tmp_path)


def test_fetch_caches_the_image_and_network_errors_fail(tmp_path, monkeypatch):
    import io

    buf = io.BytesIO()
    logo().save(buf, "PNG")
    calls = []
    monkeypatch.setattr(commons, "file_info", lambda names: {names[0]: INFO})
    monkeypatch.setattr(commons, "get_bytes", lambda url: calls.append(url) or buf.getvalue())
    puzzle.fetch(BRAND, tmp_path)
    info, img = puzzle.fetch(BRAND, tmp_path)
    assert calls == [INFO.thumb_url] and img.size == (960, 400)

    def down(url):
        raise commons.FetchError("timeout")

    monkeypatch.setattr(commons, "get_bytes", down)
    with pytest.raises(commons.FetchError):
        puzzle.fetch(BRAND, tmp_path / "empty")


# ---- the pool and schedule ----

def test_pool_is_unique_and_complete():
    pool = puzzle.load_pool(POOL)
    assert 150 <= len(pool) <= 350
    assert len({b.id for b in pool}) == len(pool)
    assert len({puzzle.plain(b.name) for b in pool}) == len(pool)
    files = [commons.file_key(b.file) for b in pool if b.file]
    assert len(set(files)) == len(files)
    for b in pool:
        assert b.industry in puzzle.INDUSTRIES, b.id
        assert b.country and 1500 < b.founded <= 2026, b.id
        assert b.wiki and b.name, b.id


def test_wordmarks_and_brands_without_a_file_are_guessable_but_never_answers():
    pool = puzzle.load_pool(POOL)
    answers = puzzle.answer_pool(pool)
    assert all(b.file and not b.wordmark for b in answers)
    guessable = puzzle.guess_list(pool)
    assert len(guessable) == len(pool)
    assert all(set(g) == {"id", "name", "aliases", "industry", "country", "founded"} for g in guessable)


def test_guess_list_matches_the_pool():
    # Regenerate with: python generator/generate_logos.py --guess-list web/public/data/brands.json
    assert json.loads(GUESS_LIST.read_text()) == puzzle.guess_list(puzzle.load_pool(POOL))


def test_first_letters():
    assert puzzle.first_letter("Škoda") == "S"
    assert puzzle.first_letter("7 Up") == "7"
    assert puzzle.first_letter("easyJet") == "E"


def test_rotation_is_stable_and_salted():
    pool = puzzle.load_pool(POOL)
    assert [b.id for b in puzzle.rotation(pool, "a")] == [b.id for b in puzzle.rotation(pool, "a")]
    assert [b.id for b in puzzle.rotation(pool, "a")] != [b.id for b in puzzle.rotation(pool, "b")]


def answerable(n):
    return [Brand(f"brand-{i:02d}", f"Brand {i:02d}", f"Brand {i}", "", f"B{i}.svg", "Tech", "Japan", 1990) for i in range(n)]


def test_fallback_moves_to_the_next_brand_without_naming_it(tmp_path, monkeypatch, capsys):
    import generate_logos

    pool = answerable(5) + [Brand("wordy-co", "Wordy", "Wordy", "", "Wordy.svg", "Tech", "Japan", 1990, wordmark=True)]
    order = puzzle.rotation(puzzle.answer_pool(pool), "seed")
    tried = []

    def fake_build(brand, date, number, out, cache):
        tried.append(brand.id)
        if brand.id == order[1].id:
            raise Rejected(f"{brand.id}: not public domain")

    monkeypatch.setattr(generate_logos, "build", fake_build)
    launch = dt.date(2026, 10, 18)
    generate_logos.generate_day(dt.date(2026, 10, 19), pool, launch, "seed", tmp_path, tmp_path)
    assert tried == [order[1].id, order[2].id]
    out = capsys.readouterr().out
    assert "logos 2026-10-19 #2 ok" in out
    assert not any(b.id in out or b.name in out for b in pool)

    tried.clear()
    generate_logos.generate_day(launch, pool, launch, "seed", tmp_path, tmp_path)
    assert tried == [order[0].id]


def test_every_brand_rejected_fails_the_day(tmp_path, monkeypatch):
    import generate_logos

    def reject(*args):
        raise Rejected("no")

    monkeypatch.setattr(generate_logos, "build", reject)
    with pytest.raises(SystemExit):
        generate_logos.generate_day(dt.date(2026, 10, 19), answerable(3), dt.date(2026, 10, 18), "seed", tmp_path, tmp_path)


def test_schedule_is_the_same_on_every_run(tmp_path, monkeypatch):
    import generate_logos

    pool = puzzle.load_pool(POOL)
    if not puzzle.answer_pool(pool):
        pool = answerable(40)
    picked, again = {}, {}
    launch = dt.date(2026, 10, 18)
    for store in (picked, again):
        monkeypatch.setattr(generate_logos, "build", lambda brand, date, *a, store=store: store.__setitem__(date, brand.id))
        for d in range(30):
            generate_logos.generate_day(launch + dt.timedelta(days=d), pool, launch, "seed", tmp_path, tmp_path)
    assert picked == again
    assert len(set(picked.values())) == min(30, len(puzzle.answer_pool(pool)))
