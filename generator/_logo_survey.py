"""TEMPORARY (removed before merge): contact sheets of candidate logos, posted as base64 annotations.

    python generator/_logo_survey.py SHARD SHARDS [search ids, comma-separated]
"""
import base64
import io
import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

from PIL import Image, ImageDraw  # noqa: E402

from logos_gen import commons, render  # noqa: E402
from logos_gen.puzzle import load_pool  # noqa: E402

PER_SHEET, COLS, CELL = 64, 8, (120, 64)


def note(kind, title, msg):
    msg = msg.replace("%", "%25").replace("\r", "%0D").replace("\n", "%0A")
    print(f"::{kind} title={title}::{msg}", flush=True)


def search(name):
    payload = commons.get_json(commons.COMMONS_API, {
        "action": "query", "format": "json", "formatversion": "2", "list": "search",
        "srsearch": f"{name} logo", "srnamespace": "6", "srlimit": "12",
    })
    return [r["title"][5:] for r in (payload.get("query") or {}).get("search") or []]


def main():
    shard, shards = int(sys.argv[1]), int(sys.argv[2])
    search_ids = set(sys.argv[3].split(",")) if len(sys.argv) > 3 and sys.argv[3] else set()
    brands = load_pool(HERE / "brands.csv")
    entities = commons.entities_for(brands)
    cands = []  # (label, file)
    for b in brands:
        e = entities[b.id]
        seen = set()
        for tag, name in (("", b.file or (e.logos[0] if e and e.logos else "")), ("+i", e.icons[0] if e and e.icons else "")):
            if name and commons.file_key(name) not in seen:
                seen.add(commons.file_key(name))
                cands.append((f"{b.id}{tag}", name))
        if b.id in search_ids:
            found = [f for f in search(b.name) if commons.file_key(f) not in seen and not f.lower().endswith((".jpg", ".jpeg", ".tif", ".tiff", ".pdf", ".webm", ".ogv", ".gif"))]
            for k, f in enumerate(found[:4]):
                cands.append((f"{b.id}#{k + 1}", f))
    infos = commons.file_info([f for _, f in cands], width=250)
    cands = [(label, f) for label, f in cands if not infos[f].missing and infos[f].public_domain]
    sheets = [cands[i:i + PER_SHEET] for i in range(0, len(cands), PER_SHEET)]
    print(f"{len(cands)} PD candidates, {len(sheets)} sheets")
    for s, batch in enumerate(sheets):
        if s % shards != shard:
            continue
        rows = -(-len(batch) // COLS)
        sheet = Image.new("RGB", (COLS * CELL[0], rows * CELL[1]), (150, 150, 150))
        draw = ImageDraw.Draw(sheet)
        for i, (label, f) in enumerate(batch):
            x, y = (i % COLS) * CELL[0], (i // COLS) * CELL[1]
            try:
                img = Image.open(io.BytesIO(commons.get_bytes(infos[f].thumb_url)))
                img.load()
                flat, bg = render.flatten(img)
                framed = render.frame(flat, bg)
                framed.thumbnail((CELL[0] - 6, CELL[1] - 14))
                sheet.paste(framed, (x + (CELL[0] - framed.width) // 2, y + 1))
            except Exception as err:  # noqa: BLE001
                draw.text((x + 4, y + 20), f"ERR {type(err).__name__}", fill=(255, 0, 0))
            draw.text((x + 3, y + CELL[1] - 13), label[:20], fill=(0, 0, 0))
        buf = io.BytesIO()
        sheet.convert("P", palette=Image.ADAPTIVE, colors=12).save(buf, "PNG", optimize=True)
        data = base64.b64encode(buf.getvalue()).decode()
        parts = [data[i:i + 4000] for i in range(0, len(data), 4000)]
        kind = "notice" if s // shards % 2 == 0 else "warning"
        for k, part in enumerate(parts):
            note(kind, f"S{s:02d} {k + 1}/{len(parts)}", part)
        mapping = "\n".join(f"{label}\t{commons.file_key(f)}" for label, f in batch)
        for k in range(0, len(mapping), 3900):
            note("error", f"M{s:02d} {k // 3900 + 1}", mapping[k:k + 3900])
    print(json.dumps(len(sheets)))


if __name__ == "__main__":
    main()
