import { describe, expect, it } from 'vitest'
import { type Answer, contourClues } from './puzzle'

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
