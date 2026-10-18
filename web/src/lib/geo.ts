const EARTH_RADIUS_KM = 6371.0088
const rad = (d: number) => (d * Math.PI) / 180
const deg = (r: number) => (r * 180) / Math.PI

export type Bounds = { west: number; south: number; east: number; north: number }

export function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const dp = rad(lat2 - lat1)
  const dl = rad(lon2 - lon1)
  const a = Math.sin(dp / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dl / 2) ** 2
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(a))
}

/** Initial compass bearing from point 1 to point 2, 0-360 degrees clockwise from north. */
export function bearingDeg(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const y = Math.sin(rad(lon2 - lon1)) * Math.cos(rad(lat2))
  const x = Math.cos(rad(lat1)) * Math.sin(rad(lat2)) - Math.sin(rad(lat1)) * Math.cos(rad(lat2)) * Math.cos(rad(lon2 - lon1))
  return (deg(Math.atan2(y, x)) + 360) % 360
}

const POINTS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW']
export function compass(bearing: number): string {
  return POINTS[Math.round(bearing / 45) % 8]
}

const mercY = (lat: number) => Math.log(Math.tan(Math.PI / 4 + rad(lat) / 2))

/** Map a click at (fx, fy), fractions of a Web Mercator map's width and height, to lon/lat. */
export function fractionToLonLat(fx: number, fy: number, b: Bounds): { lon: number; lat: number } {
  const lon = b.west + fx * (b.east - b.west)
  const y = mercY(b.north) - fy * (mercY(b.north) - mercY(b.south))
  return { lon, lat: deg(Math.atan(Math.sinh(y))) }
}

export function lonLatToFraction(lon: number, lat: number, b: Bounds): { fx: number; fy: number } {
  return {
    fx: (lon - b.west) / (b.east - b.west),
    fy: (mercY(b.north) - mercY(lat)) / (mercY(b.north) - mercY(b.south)),
  }
}

export const MAX_PIN_SCORE = 5000

/** GeoGuessr-style: full marks on the spot, falling off over a tenth of the map's width. */
export function pinScore(distanceKm: number, mapWidthKm: number): number {
  return Math.round(MAX_PIN_SCORE * Math.exp((-10 * distanceKm) / mapWidthKm))
}
