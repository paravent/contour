import { addDays } from './day'
import { MAX_GUESSES, normalise } from './puzzle'
import { BIT } from './share'

export type SpikePuzzle = {
  game: 'spike'
  number: number
  date: string
  start: string // first day of the chart, YYYY-MM-DD
  views: number[] // daily pageviews, one per day from start
  spikes: number[] // indexes into views of the tallest peaks, tallest first
  secret: string
}

export type SpikeAnswer = {
  id: string
  name: string
  category: string
  description: string
  extract: string
  url: string
  letter: string
}

export type Article = { id: string; name: string; category: string; aliases: string[] }

export const STAGES = 6

/**
 * Wrong guesses made before each clue shows. The article's category is there from the
 * start, so the chart is never "literally anything"; each miss then adds one more.
 */
export const SPIKE_CLUES = { category: 0, scale: 1, dates: 2, description: 3, shape: 4, letter: 5 } as const

const CLUE_NAMES: Record<keyof typeof SPIKE_CLUES, string> = {
  category: 'CATEGORY',
  scale: 'Y-AXIS SCALE',
  dates: 'SPIKE DATES',
  description: 'DESCRIPTION',
  shape: 'NAME SHAPE',
  letter: 'FIRST LETTER',
}

/** What the next wrong guess unlocks at this stage, or null when every clue is out. */
export function nextSpikeClue(stage: number): string | null {
  const next = (Object.keys(SPIKE_CLUES) as (keyof typeof SPIKE_CLUES)[]).find((k) => SPIKE_CLUES[k] === stage + 1)
  return next ? CLUE_NAMES[next] : null
}

export function spikeDir(date: string): string {
  return `puzzles/spike/${date}/`
}

export async function loadSpikePuzzle(date: string): Promise<SpikePuzzle | null> {
  const res = await fetch(`${spikeDir(date)}puzzle.json`)
  if (!res.ok) return null
  return res.json()
}

export async function loadArticles(): Promise<Article[]> {
  const res = await fetch('data/spike-articles.json')
  return res.json()
}

export function decodeSpikeAnswer(secret: string): SpikeAnswer {
  const bytes = Uint8Array.from(atob(secret), (c) => c.charCodeAt(0))
  return JSON.parse(new TextDecoder().decode(bytes))
}

/** Ignore a leading "The", so "beatles" finds The Beatles. */
const key = (s: string) => normalise(s).replace(/^the /, '')

export function searchArticles(articles: Article[], query: string, limit = 6): Article[] {
  const q = key(query)
  if (!q) return []
  // Exact names first, then prefixes, then any word starting with the query, then substrings.
  const ranked: { a: Article; rank: number; len: number }[] = []
  for (const a of articles) {
    let rank = 4
    let len = Infinity
    for (const n of [a.name, ...a.aliases].map(key)) {
      const r = n === q ? 0 : n.startsWith(q) ? 1 : ` ${n}`.includes(` ${q}`) ? 2 : n.includes(q) ? 3 : 4
      if (r < rank || (r === rank && n.length < len)) {
        rank = r
        len = n.length
      }
    }
    if (rank < 4) ranked.push({ a, rank, len })
  }
  ranked.sort((x, y) => x.rank - y.rank || x.len - y.len || x.a.name.localeCompare(y.a.name))
  return ranked.slice(0, limit).map((r) => r.a)
}

/** The words of the answer's name, letters and digits only, without a "(film)"-style qualifier. */
export function nameWords(name: string): string[] {
  return name
    .replace(/\s*\([^)]*\)$/, '')
    .split(/\s+/)
    .map((w) => w.replace(/[^\p{L}\p{N}]/gu, ''))
    .filter((w) => w.length > 0)
}

export const nameShape = (name: string): number[] => nameWords(name).map((w) => w.length)

export type Verdict = 'hit' | 'near' | 'miss'

/** A wrong guess in the answer's category is "near". */
export function verdict(guess: Article, answer: SpikeAnswer): Verdict {
  if (guess.id === answer.id) return 'hit'
  return guess.category === answer.category ? 'near' : 'miss'
}

const SQUARE: Record<Verdict, string> = { hit: '🟦', near: '🟨', miss: '⬛' }

export function spikeShareText(number: number, verdicts: Verdict[], won: boolean): string {
  const tries = won ? `${verdicts.length}/${MAX_GUESSES}` : `X/${MAX_GUESSES}`
  return `${BIT} SPIKE #${number} ${tries}\n${verdicts.map((v) => SQUARE[v]).join('')}`
}

/** Up to about `count` round axis values from 0 to at least max. */
export function niceTicks(max: number, count = 4): number[] {
  if (max <= 0) return [0]
  const raw = max / count
  const mag = 10 ** Math.floor(Math.log10(raw))
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw)!
  const ticks = []
  for (let v = 0; v < max + step; v += step) ticks.push(v)
  return ticks
}

/** 1234 -> "1.2K", 2500000 -> "2.5M". */
export function compact(n: number): string {
  if (n >= 1e6) return `${trim(n / 1e6)}M`
  if (n >= 1e3) return `${trim(n / 1e3)}K`
  return String(Math.round(n))
}
const trim = (x: number) => (x >= 100 ? x.toFixed(0) : x.toFixed(1).replace(/\.0$/, ''))

const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC']

/** "2026-03-17" -> "17 MAR 26". */
export function shortDate(date: string): string {
  const [y, m, d] = date.split('-')
  return `${Number(d)} ${MONTHS[Number(m) - 1]} ${y.slice(2)}`
}

/** Indexes of the days that start a month, with the month's label. */
export function monthStarts(start: string, days: number): { index: number; label: string }[] {
  const out = []
  for (let i = 0; i < days; i++) {
    const d = addDays(start, i)
    if (d.endsWith('-01')) out.push({ index: i, label: MONTHS[Number(d.slice(5, 7)) - 1] })
  }
  return out
}
