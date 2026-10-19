import { normalise } from './puzzle'
import { BIT } from './share'

export type LogoStage = { image: string; kind: 'grid' | 'blur'; grid?: [number, number] }

export type LogosPuzzle = {
  game: 'logos'
  number: number
  date: string
  aspect: number // width / height of the framed logo
  background: string // the solid colour the logo sits on
  stages: LogoStage[]
  reveal: string
  secret: string
}

/** One brand in the guess list (web/public/data/brands.json, built from generator/brands.csv). */
export type Brand = {
  id: string
  name: string
  aliases: string[]
  industry: string
  country: string
  founded: number
}

export type BrandAnswer = Omit<Brand, 'aliases'> & { letter: string; credit: string; licence: string; source: string }

export const MAX_GUESSES = 6

// Misses made before each clue unlocks: the industry after one, the country after two,
// the founding decade after three and the first letter after four.
export const CLUE_STAGE = { industry: 1, country: 2, founded: 3, letter: 4 } as const

export function logosDir(date: string): string {
  return `puzzles/logos/${date}/`
}

export async function loadLogosPuzzle(date: string): Promise<LogosPuzzle | null> {
  const res = await fetch(`${logosDir(date)}puzzle.json`)
  if (!res.ok) return null
  return res.json()
}

export async function loadBrands(): Promise<Brand[]> {
  const res = await fetch('data/brands.json')
  return res.json()
}

export function decodeBrand(secret: string): BrandAnswer {
  const bytes = Uint8Array.from(atob(secret), (c) => c.charCodeAt(0))
  return JSON.parse(new TextDecoder().decode(bytes))
}

/** '1970S' for 1976. */
export function decade(year: number): string {
  return `${Math.floor(year / 10) * 10}S`
}

/** Type-ahead over names and aliases: exact, then prefixes, then a word starting with the query, then substrings. */
export function searchBrands(brands: Brand[], query: string, limit = 6): Brand[] {
  const q = normalise(query)
  if (!q) return []
  const squash = (s: string) => s.replace(/ /g, '')
  const ranked: { b: Brand; rank: number }[] = []
  for (const b of brands) {
    const names = [b.name, ...b.aliases].map(normalise)
    let rank: number
    if (names.some((n) => n === q || squash(n) === squash(q))) rank = 0
    else if (names.some((n) => n.startsWith(q) || squash(n).startsWith(squash(q)) || n.startsWith(`the ${q}`))) rank = 1
    else if (names.some((n) => n.split(' ').some((w) => w.startsWith(q)))) rank = 2
    else if (q.length >= 3 && names.some((n) => n.includes(q))) rank = 3
    else continue
    ranked.push({ b, rank })
  }
  ranked.sort((x, y) => x.rank - y.rank || x.b.name.localeCompare(y.b.name))
  return ranked.slice(0, limit).map((r) => r.b)
}

export type Closeness = 'hit' | 'near' | 'mid' | 'far'

export type BrandResult = {
  id: string
  name: string
  industry: string
  country: string
  founded: number
  correct: boolean
  /** Answer's founding year minus the guess's: positive means the answer was founded later. */
  foundedDelta: number
  sameIndustry: boolean
  sameCountry: boolean
}

export function compareBrand(guess: Brand, answer: BrandAnswer): BrandResult {
  return {
    id: guess.id,
    name: guess.name,
    industry: guess.industry,
    country: guess.country,
    founded: guess.founded,
    correct: guess.id === answer.id,
    foundedDelta: answer.founded - guess.founded,
    sameIndustry: guess.industry === answer.industry,
    sameCountry: guess.country === answer.country,
  }
}

/** near: same industry and country; mid: one of the two; far: neither. */
export function brandCloseness(r: BrandResult): Closeness {
  if (r.correct) return 'hit'
  if (r.sameIndustry && r.sameCountry) return 'near'
  if (r.sameIndustry || r.sameCountry) return 'mid'
  return 'far'
}

/** One plain line on what a miss shares with the answer. */
export function brandHint(r: BrandResult): string {
  if (r.correct) return 'MATCH'
  if (r.sameIndustry && r.sameCountry) return 'SAME INDUSTRY & COUNTRY'
  if (r.sameIndustry) return 'SAME INDUSTRY'
  if (r.sameCountry) return 'SAME COUNTRY'
  return 'DIFFERENT INDUSTRY & COUNTRY'
}

/** 'FOUNDED 12Y LATER', 'FOUNDED 40Y EARLIER' or 'FOUNDED SAME YEAR': the answer relative to the guess. */
export function foundedHint(delta: number): string {
  if (delta === 0) return 'FOUNDED SAME YEAR'
  return `FOUNDED ${Math.abs(delta)}Y ${delta > 0 ? 'LATER' : 'EARLIER'}`
}

const SQUARE: Record<Closeness, string> = { hit: '🟦', near: '🟨', mid: '🟧', far: '⬛' }

export function logosShareText(number: number, results: BrandResult[], won: boolean): string {
  const tries = won ? `${results.length}/${MAX_GUESSES}` : `X/${MAX_GUESSES}`
  return `${BIT} LOGOS #${number} ${tries}\n${results.map((r) => SQUARE[brandCloseness(r)]).join('')}`
}
