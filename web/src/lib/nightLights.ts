import { normalise } from './puzzle'
import { BIT } from './share'

export const GAME = 'night-lights'
export const MAX_GUESSES = 6
/** From this stage (0-based) on, the country is shown; on the last, the first letter too. */
export const COUNTRY_HINT_STAGE = 4

export type Stage = { image: string; widthKm: number }

export type NightPuzzle = {
  game: 'night-lights'
  number: number
  date: string
  stages: Stage[]
  secret: string
}

export type NightAnswer = {
  cityId: string
  city: string
  country: string
  countryName: string
  lat: number
  lon: number
  letter: string
  x: number // where the city sits in each stage image, 0-1
  y: number
}

export type City = { id: string; name: string; country: string; countryName: string; aliases: string[]; lat: number; lon: number }

export function nightDir(date: string): string {
  return `puzzles/${GAME}/${date}/`
}

export async function loadNightPuzzle(date: string): Promise<NightPuzzle | null> {
  const res = await fetch(`${nightDir(date)}puzzle.json`)
  if (!res.ok) return null
  return res.json()
}

export async function loadCities(): Promise<City[]> {
  const res = await fetch('data/cities.json')
  return res.json()
}

export function decodeNightAnswer(secret: string): NightAnswer {
  const bytes = Uint8Array.from(atob(secret), (c) => c.charCodeAt(0))
  return JSON.parse(new TextDecoder().decode(bytes))
}

/** Type-ahead over the city pool: by city name or alias, or by country ("japan" lists Japan's cities). */
export function searchCities(cities: City[], query: string, limit = 6): City[] {
  const q = normalise(query)
  if (!q) return []
  // Exact names first, then prefixes (shortest first), then substrings, then country matches.
  const ranked: { c: City; rank: number; len: number }[] = []
  for (const c of cities) {
    let rank = 4
    let len = Infinity
    for (const n of [c.name, ...c.aliases].map(normalise)) {
      const r = n === q ? 0 : n.startsWith(q) ? 1 : n.includes(q) ? 2 : 4
      if (r < rank || (r === rank && n.length < len)) {
        rank = r
        len = n.length
      }
    }
    if (rank === 4 && q.length >= 3 && normalise(c.countryName).startsWith(q)) rank = 3
    if (rank < 4) ranked.push({ c, rank, len })
  }
  ranked.sort((a, b) => a.rank - b.rank || a.len - b.len || a.c.name.localeCompare(b.c.name))
  return ranked.slice(0, limit).map((r) => r.c)
}

export type CityGuess = { id: string; name: string; km: number; direction: string; correct: boolean }

export type Closeness = 'hit' | 'near' | 'mid' | 'far'

/** Cities are closer together than countries, so the bands are tighter than Contour's. */
export function cityCloseness(g: CityGuess): Closeness {
  if (g.correct) return 'hit'
  if (g.km < 300) return 'near'
  if (g.km < 1000) return 'mid'
  return 'far'
}

const SQUARE: Record<Closeness, string> = { hit: '🟨', near: '🟧', mid: '🟫', far: '⬛' }

export function nightShareText(number: number, results: CityGuess[], won: boolean): string {
  const tries = won ? `${results.length}/${MAX_GUESSES}` : `X/${MAX_GUESSES}`
  const squares = results.map((g) => SQUARE[cityCloseness(g)]).join('')
  return `${BIT} NIGHT LIGHTS #${number} ${tries}\n${squares}`
}
