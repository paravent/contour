"""Turn a painting into Palette's six stages.

From EASIER_FROM (see puzzle.py): four pixel grids, a soft blur, then a nearly sharp image.
Before it: colour stripes, four pixel grids, a blur.
"""

import io

import numpy as np
from PIL import Image, ImageFilter

PALETTE_SIZE = 5
GRIDS = (12, 20, 32, 48)  # cells along the painting's long side, stages 1-4
LEGACY_GRIDS = (4, 8, 16, 32)  # stages 2-5 of the original layout
BLUR_SIDE = 144  # long side of the blurred stage, in pixels
BLUR_RADIUS = 3.2
DETAIL_SIDE = 240  # long side of the last, nearly sharp stage
DETAIL_RADIUS = 1.2
REVEAL_SIDE = 720  # long side of the full image on the result screen
STRIPES_SIZE = (100, 4)  # one pixel per percent of share; the browser scales it up
MIN_STRIPE = 6  # percent, so a minor colour still reads as a stripe


def palette(img: Image.Image, k=PALETTE_SIZE, iterations=24):
    """The k dominant colours as [(r, g, b), share], largest share first.

    k-means on a thumbnail, seeded k-means++ style from a fixed generator, so the
    same image always gives the same palette.
    """
    small = img.convert("RGB").copy()
    # Nearest sampling keeps real pigment colours rather than blends of neighbours.
    small.thumbnail((96, 96), Image.NEAREST)
    px = np.asarray(small, dtype=np.float64).reshape(-1, 3)
    rng = np.random.default_rng(0)

    centers = [px[rng.integers(len(px))]]
    for _ in range(1, k):
        d = np.min([((px - c) ** 2).sum(1) for c in centers], axis=0)
        if d.sum() == 0:
            centers.append(px[rng.integers(len(px))])
        else:
            centers.append(px[rng.choice(len(px), p=d / d.sum())])
    centers = np.array(centers)

    for _ in range(iterations):
        labels = ((px[:, None, :] - centers[None]) ** 2).sum(2).argmin(1)
        moved = np.array([px[labels == j].mean(0) if (labels == j).any() else centers[j] for j in range(k)])
        if np.allclose(moved, centers, atol=0.5):
            centers = moved
            break
        centers = moved

    labels = ((px[:, None, :] - centers[None]) ** 2).sum(2).argmin(1)
    shares = np.bincount(labels, minlength=k) / len(px)
    order = np.argsort(-shares, kind="stable")
    return [(tuple(int(round(v)) for v in centers[j]), float(shares[j])) for j in order if shares[j] > 0]


def hex_colour(rgb) -> str:
    return "#{:02X}{:02X}{:02X}".format(*rgb)


def stripe_widths(shares, total=STRIPES_SIZE[0], minimum=MIN_STRIPE):
    """Whole-pixel stripe widths proportional to share, each at least `minimum`, summing to `total`."""
    n = len(shares)
    spare = total - minimum * n
    raw = np.array(shares) / sum(shares) * spare
    widths = np.floor(raw).astype(int) + minimum
    # Hand leftover pixels to the largest remainders.
    for j in np.argsort(-(raw - np.floor(raw)), kind="stable")[: total - widths.sum()]:
        widths[j] += 1
    return widths.tolist()


def stripes(colours) -> Image.Image:
    """Vertical stripes, widest (most common colour) first."""
    w, h = STRIPES_SIZE
    widths = stripe_widths([share for _, share in colours])
    out = Image.new("RGB", (w, h))
    x = 0
    for (rgb, _), width in zip(colours, widths):
        out.paste(rgb, (x, 0, x + width, h))
        x += width
    return out


def grid_shape(size, cells):
    """(columns, rows) with `cells` along the long side and roughly square cells."""
    w, h = size
    if w >= h:
        return cells, max(1, round(cells * h / w))
    return max(1, round(cells * w / h)), cells


def pixel_grid(img: Image.Image, cells) -> Image.Image:
    """Each cell is the average colour of its part of the painting."""
    return img.convert("RGB").resize(grid_shape(img.size, cells), Image.BOX)


def blurred(img: Image.Image, side=BLUR_SIDE, radius=BLUR_RADIUS) -> Image.Image:
    small = img.convert("RGB").copy()
    small.thumbnail((side, side), Image.LANCZOS)
    return small.filter(ImageFilter.GaussianBlur(radius))


def detail(img: Image.Image) -> Image.Image:
    """Small and slightly soft: composition and brushwork read, fine detail doesn't."""
    return blurred(img, DETAIL_SIDE, DETAIL_RADIUS)


def reveal(img: Image.Image) -> Image.Image:
    full = img.convert("RGB").copy()
    full.thumbnail((REVEAL_SIDE, REVEAL_SIDE), Image.LANCZOS)
    return full


def png_bytes(img: Image.Image) -> bytes:
    buf = io.BytesIO()
    img.save(buf, "PNG", optimize=True)
    return buf.getvalue()


def jpeg_bytes(img: Image.Image, quality=84) -> bytes:
    buf = io.BytesIO()
    img.save(buf, "JPEG", quality=quality, optimize=True, progressive=True)
    return buf.getvalue()


def colourfulness(img: Image.Image) -> float:
    """Hasler and Süsstrunk's colourfulness metric; under ~10 is close to greyscale."""
    small = img.convert("RGB").copy()
    small.thumbnail((128, 128))
    r, g, b = np.asarray(small, dtype=np.float64).reshape(-1, 3).T
    rg, yb = r - g, 0.5 * (r + g) - b
    return float(np.hypot(rg.std(), yb.std()) + 0.3 * np.hypot(rg.mean(), yb.mean()))
