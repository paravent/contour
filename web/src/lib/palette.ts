import { normalise } from './puzzle'

export type PaletteStage = { image: string; kind: 'stripes' | 'grid' | 'blur'; grid?: [number, number] }

export type PalettePuzzle = {
  game: 'palette'
  number: number
  date: string
  aspect: number // width / height
  palette: { hex: string; share: number }[]
  stages: PaletteStage[]
  reveal: string
  secret: string
}

/** One painting in the guess list (web/public/data/paintings.json, built from generator/paintings.csv). */
export type Painting = {
  id: string
  title: string
  artist: string
  year: number
  nationality: string
  movement: string
}

export type PaintingAnswer = Painting & { initials: string; museum: string; credit: string; source: string }

export const MAX_GUESSES = 6

// Text clues unlock with the stages: century from stage 2, nationality from 4, initials at 6.
export const CLUE_STAGE = { century: 1, nationality: 3, initials: 5 } as const

export function paletteDir(date: string): string {
  return `puzzles/palette/${date}/`
}

export async function loadPalettePuzzle(date: string): Promise<PalettePuzzle | null> {
  const res = await fetch(`${paletteDir(date)}puzzle.json`)
  if (!res.ok) return null
  return res.json()
}

export async function loadPaintings(): Promise<Painting[]> {
  const res = await fetch('data/paintings.json')
  return res.json()
}

export function decodePainting(secret: string): PaintingAnswer {
  const bytes = Uint8Array.from(atob(secret), (c) => c.charCodeAt(0))
  return JSON.parse(new TextDecoder().decode(bytes))
}

/** '19TH CENTURY' for 1889. */
export function century(year: number): string {
  const c = Math.floor((year - 1) / 100) + 1
  const suffix = c % 100 >= 11 && c % 100 <= 13 ? 'TH' : ({ 1: 'ST', 2: 'ND', 3: 'RD' } as Record<number, string>)[c % 10] ?? 'TH'
  return `${c}${suffix} CENTURY`
}

/** Type-ahead over titles and artists. Title matches rank above artist matches. */
export function searchPaintings(paintings: Painting[], query: string, limit = 6): Painting[] {
  const q = normalise(query)
  if (!q) return []
  const words = q.split(' ')
  const ranked: { p: Painting; rank: number }[] = []
  for (const p of paintings) {
    const title = normalise(p.title)
    const artist = normalise(p.artist)
    const both = `${title} ${artist}`
    let rank: number
    if (title === q) rank = 0
    else if (title.startsWith(q) || title.startsWith(`the ${q}`)) rank = 1
    else if (title.includes(q)) rank = 2
    else if (artist.split(' ').some((w) => w.startsWith(q)) || artist.includes(q)) rank = 3
    // Every typed word somewhere in title or artist, e.g. "monet lilies".
    else if (words.every((w) => both.split(' ').some((b) => b.startsWith(w)))) rank = 4
    else continue
    ranked.push({ p, rank })
  }
  ranked.sort((a, b) => a.rank - b.rank || a.p.title.localeCompare(b.p.title))
  return ranked.slice(0, limit).map((r) => r.p)
}

export type Closeness = 'hit' | 'near' | 'mid' | 'far'

export type PaintingResult = {
  id: string
  title: string
  artist: string
  year: number
  correct: boolean
  /** Answer's year minus the guess's: positive means the answer was painted later. */
  yearDelta: number
  sameArtist: boolean
  sameMovement: boolean
  sameNationality: boolean
}

export function compare(guess: Painting, answer: Painting): PaintingResult {
  return {
    id: guess.id,
    title: guess.title,
    artist: guess.artist,
    year: guess.year,
    correct: guess.id === answer.id,
    yearDelta: answer.year - guess.year,
    sameArtist: guess.artist === answer.artist,
    sameMovement: guess.movement === answer.movement,
    sameNationality: guess.nationality === answer.nationality,
  }
}

/** near: right artist or within a decade; mid: right movement or within 40 years. */
export function paintingCloseness(r: PaintingResult): Closeness {
  if (r.correct) return 'hit'
  const gap = Math.abs(r.yearDelta)
  if (r.sameArtist || gap <= 10) return 'near'
  if (r.sameMovement || gap <= 40) return 'mid'
  return 'far'
}

/** '12Y LATER', '150Y EARLIER' or 'SAME YEAR': when the answer was painted, relative to the guess. */
export function yearHint(delta: number): string {
  if (delta === 0) return 'SAME YEAR'
  return `${Math.abs(delta)}Y ${delta > 0 ? 'LATER' : 'EARLIER'}`
}

const SQUARE: Record<Closeness, string> = { hit: '🟦', near: '🟨', mid: '🟧', far: '⬛' }

export function paletteShareText(number: number, results: PaintingResult[], won: boolean): string {
  const tries = won ? `${results.length}/${MAX_GUESSES}` : `X/${MAX_GUESSES}`
  return `PALETTE #${number} ${tries}\n${results.map((r) => SQUARE[paintingCloseness(r)]).join('')}`
}
