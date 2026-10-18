"""Web Mercator and great-circle helpers."""

import math

TILE_SIZE = 256
EARTH_RADIUS_KM = 6371.0088
# Metres per pixel at zoom 0 on the equator for 256 px tiles.
EQUATOR_MPP = 156543.03392


def lonlat_to_px(lon, lat, zoom):
    """Global pixel coordinates of a point at a zoom level."""
    scale = TILE_SIZE * 2**zoom
    x = (lon + 180.0) / 360.0 * scale
    s = math.sin(math.radians(lat))
    y = (0.5 - math.log((1 + s) / (1 - s)) / (4 * math.pi)) * scale
    return x, y


def px_to_lonlat(x, y, zoom):
    scale = TILE_SIZE * 2**zoom
    lon = x / scale * 360.0 - 180.0
    n = math.pi - 2 * math.pi * y / scale
    lat = math.degrees(math.atan(math.sinh(n)))
    return lon, lat


def metres_per_px(lat, zoom):
    return EQUATOR_MPP * math.cos(math.radians(lat)) / 2**zoom


def haversine_km(lat1, lon1, lat2, lon2):
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp = p2 - p1
    dl = math.radians(lon2 - lon1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * EARTH_RADIUS_KM * math.asin(math.sqrt(a))
