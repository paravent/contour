import { describe, expect, it } from 'vitest'
import { searchCountries } from './puzzle'
import { shareText } from './share'

describe('share text', () => {
  it('shows tries, pin score and one square per guess', () => {
    const results = [
      { code: 'PRT', name: 'Portugal', km: 2380, direction: 'NE', correct: false },
      { code: 'FRA', name: 'France', km: 320, direction: 'E', correct: false },
      { code: 'CHE', name: 'Switzerland', km: 0, direction: 'N', correct: true },
    ]
    expect(shareText(214, results, true, 4610)).toBe('▮ CONTOUR #214 3/6 · pin 4610\n⬛🟨🟦')
    expect(shareText(214, results.slice(0, 2), false)).toBe('▮ CONTOUR #214 X/6\n⬛🟨')
  })
})

describe('country search', () => {
  const countries = [
    { code: 'CIV', name: "Côte d'Ivoire", aliases: ['Ivory Coast'], lat: 0, lon: 0 },
    { code: 'USA', name: 'United States of America', aliases: ['United States'], lat: 0, lon: 0 },
    { code: 'GBR', name: 'United Kingdom', aliases: [], lat: 0, lon: 0 },
    { code: 'VIR', name: 'United States Virgin Islands', aliases: [], lat: 0, lon: 0 },
  ]
  it('matches prefixes, aliases and accents', () => {
    expect(searchCountries(countries, 'cote').map((c) => c.code)).toEqual(['CIV'])
    expect(searchCountries(countries, 'ivory').map((c) => c.code)).toEqual(['CIV'])
    expect(searchCountries(countries, 'united').map((c) => c.code)).toEqual(['USA', 'GBR', 'VIR'])
    expect(searchCountries(countries, 'united states')[0].code).toBe('USA')
    expect(searchCountries(countries, 'kingdom').map((c) => c.code)).toEqual(['GBR'])
  })
})
