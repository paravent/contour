import { MAX_GUESSES } from './puzzle'

export type GuessResult = { code: string; name: string; km: number; direction: string; correct: boolean }

export type Closeness = 'hit' | 'near' | 'mid' | 'far'

export function closeness(g: GuessResult): Closeness {
  if (g.correct) return 'hit'
  if (g.km < 500) return 'near'
  if (g.km < 1500) return 'mid'
  return 'far'
}

/** Bit's glyph: signs every share text. */
export const BIT = '▮'

const SQUARE: Record<Closeness, string> = { hit: '🟦', near: '🟨', mid: '🟧', far: '⬛' }

export function shareText(number: number, results: GuessResult[], won: boolean, pinScore?: number): string {
  const tries = won ? `${results.length}/${MAX_GUESSES}` : `X/${MAX_GUESSES}`
  const pin = pinScore !== undefined ? ` · pin ${pinScore}` : ''
  const squares = results.map((g) => SQUARE[closeness(g)]).join('')
  return `${BIT} CONTOUR #${number} ${tries}${pin}\n${squares}`
}
