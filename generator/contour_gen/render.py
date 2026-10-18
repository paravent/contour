"""Draw a View as a neon contour-map SVG."""

import numpy as np
from contourpy import contour_generator

from .terrain import GRID, View

SIZE = 400  # SVG viewBox is SIZE x SIZE

CYAN = "#2DE2D0"
MAGENTA = "#FF2E88"
AMBER = "#FFC94D"
SEA = "#140C18"

# Closed water outlines smaller than this (in SVG units squared) are data noise, not lakes or islands.
SPECK_AREA = (SIZE * 0.03) ** 2

NICE_INTERVALS = [5, 10, 20, 25, 50, 100, 200, 250, 500, 1000]


def contour_interval(elevation: np.ndarray, max_lines=24):
    """Smallest round interval that keeps the number of land contours readable."""
    land = elevation[elevation > 0]
    if land.size == 0:
        return None
    span = float(land.max()) - max(float(land.min()), 0.0)
    for step in NICE_INTERVALS:
        if span / step <= max_lines:
            return step
    return NICE_INTERVALS[-1]


def land_levels(elevation, interval):
    top = float(elevation.max())
    first = interval  # level 0 is the coastline, drawn separately
    return list(np.arange(first, top, interval))


def _simplify(points: np.ndarray, tolerance: float) -> np.ndarray:
    """Ramer-Douglas-Peucker, iterative."""
    if len(points) < 3:
        return points
    keep = np.zeros(len(points), dtype=bool)
    keep[0] = keep[-1] = True
    stack = [(0, len(points) - 1)]
    while stack:
        i, j = stack.pop()
        if j <= i + 1:
            continue
        a, b = points[i], points[j]
        seg = b - a
        norm = np.hypot(*seg)
        rel = points[i + 1:j] - a
        if norm == 0:
            dist = np.hypot(rel[:, 0], rel[:, 1])
        else:
            dist = np.abs(seg[0] * rel[:, 1] - seg[1] * rel[:, 0]) / norm
        k = int(np.argmax(dist))
        if dist[k] > tolerance:
            m = i + 1 + k
            keep[m] = True
            stack += [(i, m), (m, j)]
    return points[keep]


def _loop_area(line):
    x, y = line[:, 0], line[:, 1]
    return abs(np.dot(x, np.roll(y, 1)) - np.dot(y, np.roll(x, 1))) / 2


def _path(lines, tolerance, closed=False, min_points=4, min_loop_area=0.0):
    parts = []
    for line in lines:
        if len(line) < min_points:
            continue
        is_loop = np.allclose(line[0], line[-1])
        if min_loop_area and (closed or is_loop) and _loop_area(line) < min_loop_area:
            continue
        pts = _simplify(line, tolerance)
        if len(pts) < 2:
            continue
        coords = " ".join(f"{x:.1f} {y:.1f}" for x, y in pts)
        parts.append(f"M{coords}{'Z' if closed else ''}")
    return "".join(parts)


def render_svg(view: View, *, coast=False, sea=False, borders=None, max_lines=24, tolerance=0.7) -> str:
    """borders: list of rings of (lon, lat) to draw faintly, or None."""
    z = view.elevation
    axis = np.linspace(0, SIZE, GRID)
    gen = contour_generator(axis, axis, z, line_type="Separate", fill_type="OuterOffset")

    out = [
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {SIZE} {SIZE}" '
        f'width="{SIZE}" height="{SIZE}">'
    ]

    if sea and (z <= 0).any():
        polys, offsets = gen.filled(-20000.0, 0.0)
        rings = []
        for pts, offs in zip(polys, offsets):
            rings += [pts[offs[k]:offs[k + 1]] for k in range(len(offs) - 1)]
        d = _path(rings, tolerance, closed=True, min_points=12, min_loop_area=SPECK_AREA)
        if d:
            out.append(f'<path d="{d}" fill="{SEA}" fill-rule="evenodd"/>')

    interval = contour_interval(z, max_lines)
    if interval:
        minor, index = [], []
        for level in land_levels(z, interval):
            (index if round(level / interval) % 5 == 0 else minor).extend(gen.lines(level))
        for lines, width, opacity in ((minor, 0.7, 0.7), (index, 1.4, 1.0)):
            d = _path(lines, tolerance)
            if d:
                out.append(
                    f'<path d="{d}" fill="none" stroke="{CYAN}" stroke-width="{width}" '
                    f'stroke-opacity="{opacity}" stroke-linejoin="round" stroke-linecap="round"/>'
                )

    if coast and (z <= 0).any():
        d = _path(gen.lines(0.0), tolerance, min_points=12, min_loop_area=SPECK_AREA)
        if d:
            out.append(f'<path d="{d}" fill="none" stroke="{MAGENTA}" stroke-width="1.6" stroke-linejoin="round"/>')

    if borders:
        parts = []
        for ring in borders:
            pts = np.array([view.project(lon, lat, SIZE) for lon, lat in ring])
            inside = (pts[:, 0] > -SIZE) & (pts[:, 0] < 2 * SIZE) & (pts[:, 1] > -SIZE) & (pts[:, 1] < 2 * SIZE)
            if inside.any():
                parts.append(pts)
        d = _path(parts, tolerance, min_points=2)
        if d:
            out.append(
                f'<path d="{d}" fill="none" stroke="{AMBER}" stroke-width="1" '
                f'stroke-opacity="0.75" stroke-dasharray="4 3"/>'
            )

    out.append("</svg>")
    return "\n".join(out)
