import { addDays } from './day'

export type Pin = { lat: number; lon: number; km: number; score: number }

export type DayState = {
  guesses: string[] // country codes, in order
  status: 'playing' | 'won' | 'lost'
  pin?: Pin
}

export type Stats = {
  played: number
  won: number
  streak: number
  best: number
  lastFinished?: string // date of the last finished puzzle
  lastWon?: string
}

const EMPTY_DAY: DayState = { guesses: [], status: 'playing' }
const EMPTY_STATS: Stats = { played: 0, won: 0, streak: 0, best: 0 }

// Storage can be missing or throw (private windows, blocked site data); the game still works without it.
function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    return raw ? { ...fallback, ...JSON.parse(raw) } : fallback
  } catch {
    return fallback
  }
}

function write(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    /* ignore */
  }
}

// Each game keeps its own days and stats under its own key prefix, e.g. "contour".
export const loadDay = (game: string, date: string) => read<DayState>(`${game}:day:${date}`, EMPTY_DAY)
export const saveDay = (game: string, date: string, s: DayState) => write(`${game}:day:${date}`, s)
export const loadStats = (game: string) => read<Stats>(`${game}:stats`, EMPTY_STATS)

/** Record a finished puzzle once; the streak continues only from yesterday's win. */
export function recordFinish(game: string, stats: Stats, date: string, won: boolean): Stats {
  if (stats.lastFinished === date) return stats
  const streak = won ? (stats.lastWon === addDays(date, -1) ? stats.streak + 1 : 1) : 0
  const next: Stats = {
    played: stats.played + 1,
    won: stats.won + (won ? 1 : 0),
    streak,
    best: Math.max(stats.best, streak),
    lastFinished: date,
    lastWon: won ? date : stats.lastWon,
  }
  write(`${game}:stats`, next)
  return next
}

/** The streak as it stands today: it lapses once a day is missed. */
export function currentStreak(stats: Stats, today: string): number {
  return stats.lastWon === today || stats.lastWon === addDays(today, -1) ? stats.streak : 0
}
