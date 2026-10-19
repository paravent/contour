import { describe, expect, it } from 'vitest'
import { type Answer, contourClues, legendGradient } from './puzzle'

const answer: Answer = { placeId: 'x', place: 'X', country: 'FRA', countryName: 'France', lat: 45, lon: 6, letter: 'F', continent: 'Europe' }

describe('contour text clues', () => {
  it('opens the continent on guess 4 and the first letter on guess 6', () => {
    expect(contourClues(answer, 2)).toEqual([])
    expect(contourClues(answer, 3).map((c) => c.value)).toEqual(['EUROPE'])
    expect(contourClues(answer, 5).map((c) => c.value)).toEqual(['EUROPE', 'F'])
  })
  it('skips the continent on older sheets that lack it', () => {
    const { continent: _, ...old } = answer
    expect(contourClues(old, 5).map((c) => c.value)).toEqual(['F'])
  })
})

describe('elevation legend', () => {
  it('draws the colour bar from the sheet, and nothing for older sheets', () => {
    expect(legendGradient({ minM: 0, maxM: 2400, colors: ['#1E9FAB', '#FFE4DC'] })).toBe('linear-gradient(90deg, #1E9FAB, #FFE4DC)')
    expect(legendGradient(undefined)).toBeNull()
    expect(legendGradient({ minM: 0, maxM: 10, colors: ['#000000'] })).toBeNull()
  })
})
