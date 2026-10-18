import { describe, expect, it } from 'vitest'
import { bearingDeg, compass, fractionToLonLat, haversineKm, lonLatToFraction, pinScore } from './geo'

describe('geo', () => {
  it('measures great-circle distance', () => {
    // London to Paris is about 344 km.
    expect(haversineKm(51.5074, -0.1278, 48.8566, 2.3522)).toBeCloseTo(344, -1)
  })

  it('turns bearings into compass points', () => {
    expect(compass(bearingDeg(0, 0, 10, 0))).toBe('N')
    expect(compass(bearingDeg(0, 0, 0, 10))).toBe('E')
    expect(compass(bearingDeg(0, 0, -10, -10))).toBe('SW')
    expect(compass(359)).toBe('N')
  })

  it('round-trips map clicks through Web Mercator bounds', () => {
    const b = { west: 5, south: 44, east: 13, north: 50 }
    const p = fractionToLonLat(0.3, 0.7, b)
    const f = lonLatToFraction(p.lon, p.lat, b)
    expect(f.fx).toBeCloseTo(0.3, 9)
    expect(f.fy).toBeCloseTo(0.7, 9)
    expect(fractionToLonLat(0, 0, b)).toEqual({ lon: 5, lat: expect.closeTo(50, 9) })
  })

  it('scores pins from 5000 down', () => {
    expect(pinScore(0, 600)).toBe(5000)
    expect(pinScore(60, 600)).toBe(Math.round(5000 / Math.E))
    expect(pinScore(4.2, 600)).toBeGreaterThan(4600)
  })
})
