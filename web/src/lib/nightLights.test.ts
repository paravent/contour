import { describe, expect, it } from 'vitest'
import { type City, decodeNightAnswer, nightShareText, searchCities } from './nightLights'

const city = (id: string, name: string, countryName: string, aliases: string[] = []): City =>
  ({ id, name, country: id.slice(0, 3).toUpperCase(), countryName, aliases, lat: 0, lon: 0 })

describe('city search', () => {
  const cities = [
    city('sao', 'São Paulo', 'Brazil', ['Sao Paulo']),
    city('santiago', 'Santiago', 'Chile'),
    city('santo', 'Santo Domingo', 'Dominican Republic'),
    city('mumbai', 'Mumbai', 'India', ['Bombay']),
    city('delhi', 'Delhi', 'India', ['New Delhi']),
    city('osaka', 'Osaka', 'Japan'),
    city('kyiv', 'Kyiv', 'Ukraine', ['Kiev']),
  ]
  it('matches names, aliases and accents', () => {
    expect(searchCities(cities, 'sao').map((c) => c.id)).toEqual(['sao'])
    expect(searchCities(cities, 'san').map((c) => c.id)).toEqual(['santiago', 'santo'])
    expect(searchCities(cities, 'santiago')[0].id).toBe('santiago')
    expect(searchCities(cities, 'bombay').map((c) => c.id)).toEqual(['mumbai'])
    expect(searchCities(cities, 'kiev').map((c) => c.id)).toEqual(['kyiv'])
    expect(searchCities(cities, '')).toEqual([])
  })
  it('lists a country\'s cities after name matches', () => {
    expect(searchCities(cities, 'india').map((c) => c.id)).toEqual(['delhi', 'mumbai'])
    expect(searchCities(cities, 'del')[0].id).toBe('delhi')
    expect(searchCities(cities, 'in').map((c) => c.id)).toEqual(['santo'])
  })
})

describe('night share text', () => {
  it('shows tries and one square per guess, without names', () => {
    const results = [
      { id: 'a', name: 'Lima', km: 5200, direction: 'N', correct: false },
      { id: 'b', name: 'Bogotá', km: 700, direction: 'NE', correct: false },
      { id: 'c', name: 'Medellín', km: 210, direction: 'E', correct: false },
      { id: 'd', name: 'Caracas', km: 0, direction: 'N', correct: true },
    ]
    expect(nightShareText(12, results, true)).toBe('▮ NIGHT LIGHTS #12 4/6\n⬛🟫🟧🟨')
    expect(nightShareText(12, results.slice(0, 2), false)).toBe('▮ NIGHT LIGHTS #12 X/6\n⬛🟫')
  })
})

it('decodes a UTF-8 secret', () => {
  const secret = btoa(String.fromCharCode(...new TextEncoder().encode(JSON.stringify({ city: 'Bogotá', letter: 'B' }))))
  expect(decodeNightAnswer(secret)).toEqual({ city: 'Bogotá', letter: 'B' })
})
