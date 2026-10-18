import type { Bounds } from './geo'

export type Stage = { image: string; widthKm: number; intervalM: number | null }

export type Puzzle = {
  game: 'contour'
  number: number
  date: string
  stages: Stage[]
  pinMap: { image: string; bounds: Bounds }
  secret: string
}

export type Answer = {
  placeId: string
  place: string
  country: string
  countryName: string
  lat: number
  lon: number
  letter: string
}

export type Country = { code: string; name: string; aliases: string[]; lat: number; lon: number }

export const MAX_GUESSES = 6

export function puzzleDir(date: string): string {
  return `puzzles/contour/${date}/`
}

export async function loadPuzzle(date: string): Promise<Puzzle | null> {
  const res = await fetch(`${puzzleDir(date)}puzzle.json`)
  if (!res.ok) return null
  return res.json()
}

export async function loadCountries(): Promise<Country[]> {
  const res = await fetch('data/countries.json')
  return res.json()
}

export function decodeAnswer(secret: string): Answer {
  const bytes = Uint8Array.from(atob(secret), (c) => c.charCodeAt(0))
  return JSON.parse(new TextDecoder().decode(bytes))
}

/** Case- and accent-insensitive key for matching typed names. */
export function normalise(s: string): string {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
}

export function searchCountries(countries: Country[], query: string, limit = 6): Country[] {
  const q = normalise(query)
  if (!q) return []
  // Exact names first, then prefixes (shortest name first), then substrings.
  const ranked: { c: Country; rank: number; len: number }[] = []
  for (const c of countries) {
    const names = [c.name, ...c.aliases].map(normalise)
    let rank = 3
    let len = Infinity
    for (const n of names) {
      const r = n === q ? 0 : n.startsWith(q) ? 1 : n.includes(q) ? 2 : 3
      if (r < rank || (r === rank && n.length < len)) {
        rank = r
        len = n.length
      }
    }
    if (rank < 3) ranked.push({ c, rank, len })
  }
  ranked.sort((a, b) => a.rank - b.rank || a.len - b.len || a.c.name.localeCompare(b.c.name))
  return ranked.slice(0, limit).map((r) => r.c)
}
