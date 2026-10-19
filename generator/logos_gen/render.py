"""Turn a logo into Logos' six stages: five pixel grids, then a soft blur.

The logo is first flattened onto a solid background (white, or near-black for a
logo that is mostly white), trimmed to its ink, and framed with a margin in a
box between square and 2:1, so every logo gets the same kind of grid.
"""

import io

import numpy as np
from PIL import Image, ImageFilter

GRIDS = (8, 12, 20, 32, 48)  # cells along the frame's long side, stages 1-5
BLUR_SIDE = 160  # long side of the blurred stage, in pixels
BLUR_RADIUS = 3.0
REVEAL_SIDE = 720  # long side of the clear logo on the result screen
MARGIN = 0.12  # of the logo's long side, on every edge
MAX_ASPECT = 2.0  # frames are at most twice as wide as tall, and never taller than wide
LIGHT = (255, 255, 255)
DARK = (22, 24, 28)
INK_THRESHOLD = 24  # how far a pixel must be from the background to count as part of the logo


def luminance(rgb):
    rgb = np.asarray(rgb, dtype=np.float64)
    return rgb[..., 0] * 0.2126 + rgb[..., 1] * 0.7152 + rgb[..., 2] * 0.0722


def background_for(img: Image.Image):
    """The colour the logo sits on: its own, if it has no transparency; else white, or dark for a white logo."""
    rgba = np.asarray(img.convert("RGBA"), dtype=np.float64)
    alpha = rgba[..., 3]
    if alpha.min() >= 250:
        # An opaque image brings its own background: take the commonest edge colour.
        edge = np.concatenate([rgba[0, :, :3], rgba[-1, :, :3], rgba[:, 0, :3], rgba[:, -1, :3]]).round().astype(int)
        colours, counts = np.unique(edge, axis=0, return_counts=True)
        return tuple(int(v) for v in colours[counts.argmax()]), True
    ink = rgba[alpha > 128][:, :3]
    if len(ink) and (luminance(ink) > 215).mean() > 0.6:
        return DARK, False
    return LIGHT, False


def flatten(img: Image.Image):
    """(RGB image on a solid background, that background)."""
    bg, opaque = background_for(img)
    if opaque:
        return img.convert("RGB"), bg
    rgba = img.convert("RGBA")
    out = Image.new("RGB", rgba.size, bg)
    out.paste(rgba, mask=rgba.getchannel("A"))
    return out, bg


def ink_box(img: Image.Image, bg):
    """Bounding box of everything that isn't background, or None for a blank image."""
    px = np.asarray(img, dtype=np.int16)
    ink = np.abs(px - np.array(bg, dtype=np.int16)).max(axis=2) > INK_THRESHOLD
    if not ink.any():
        return None
    rows, cols = np.where(ink.any(axis=1))[0], np.where(ink.any(axis=0))[0]
    return int(cols[0]), int(rows[0]), int(cols[-1]) + 1, int(rows[-1]) + 1


def ink_share(img: Image.Image, bg) -> float:
    px = np.asarray(img, dtype=np.int16)
    return float((np.abs(px - np.array(bg, dtype=np.int16)).max(axis=2) > INK_THRESHOLD).mean())


def frame(img: Image.Image, bg) -> Image.Image:
    """The logo trimmed to its ink, centred with a margin in a box between 1:1 and MAX_ASPECT:1."""
    box = ink_box(img, bg)
    logo = img.crop(box) if box else img
    w, h = logo.size
    pad = round(MARGIN * max(w, h))
    fw, fh = w + 2 * pad, h + 2 * pad
    if fw / fh > MAX_ASPECT:
        fh = round(fw / MAX_ASPECT)
    elif fh > fw:
        fw = fh
    out = Image.new("RGB", (fw, fh), bg)
    out.paste(logo, ((fw - w) // 2, (fh - h) // 2))
    return out


def grid_shape(size, cells):
    """(columns, rows) with `cells` along the long side and roughly square cells."""
    w, h = size
    if w >= h:
        return cells, max(1, round(cells * h / w))
    return max(1, round(cells * w / h)), cells


def pixel_grid(img: Image.Image, cells) -> Image.Image:
    """Each cell is the average colour of its part of the logo."""
    return img.convert("RGB").resize(grid_shape(img.size, cells), Image.BOX)


def blurred(img: Image.Image, side=BLUR_SIDE, radius=BLUR_RADIUS) -> Image.Image:
    small = img.convert("RGB").copy()
    small.thumbnail((side, side), Image.LANCZOS)
    return small.filter(ImageFilter.GaussianBlur(radius))


def reveal(img: Image.Image) -> Image.Image:
    full = img.convert("RGB").copy()
    full.thumbnail((REVEAL_SIDE, REVEAL_SIDE), Image.LANCZOS)
    return full


def png_bytes(img: Image.Image) -> bytes:
    buf = io.BytesIO()
    img.save(buf, "PNG", optimize=True)
    return buf.getvalue()


def hex_colour(rgb) -> str:
    return "#{:02X}{:02X}{:02X}".format(*rgb)
