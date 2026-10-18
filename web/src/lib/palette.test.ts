import { describe, expect, it } from 'vitest'
import { type Painting, century, compare, matchHint, paintingCloseness, paletteShareText, searchPaintings, yearHint } from './palette'

const p = (id: string, title: string, artist: string, year: number, movement = 'Impressionism', nationality = 'French'): Painting => ({
  id,
  title,
  artist,
  year,
  movement,
  nationality,
})

const POOL = [
  p('lilies', 'Water Lilies', 'Claude Monet', 1906),
  p('bridge', 'Bridge over a Pond of Water Lilies', 'Claude Monet', 1899),
  p('bedroom', 'The Bedroom', 'Vincent van Gogh', 1889, 'Post-Impressionism', 'Dutch'),
  p('wheat', 'Wheat Field with Cypresses', 'Vincent van Gogh', 1889, 'Post-Impressionism', 'Dutch'),
  p('pitcher', 'Young Woman with a Water Pitcher', 'Johannes Vermeer', 1662, 'Dutch Golden Age', 'Dutch'),
  p('cezanne', 'Madame Cézanne in a Yellow Chair', 'Paul Cézanne', 1890, 'Post-Impressionism'),
]

describe('painting search', () => {
  it('ranks title prefixes, then substrings, then artists', () => {
    expect(searchPaintings(POOL, 'water').map((x) => x.id)).toEqual(['lilies', 'bridge', 'pitcher'])
    expect(searchPaintings(POOL, 'bedroom').map((x) => x.id)).toEqual(['bedroom'])
  })
  it('finds paintings by artist, accents and all', () => {
    expect(searchPaintings(POOL, 'van gogh').map((x) => x.id)).toEqual(['bedroom', 'wheat'])
    expect(searchPaintings(POOL, 'cezanne').map((x) => x.id)).toEqual(['cezanne'])
    expect(searchPaintings(POOL, 'gogh').map((x) => x.id)).toEqual(['bedroom', 'wheat'])
  })
  it('matches words across title and artist', () => {
    expect(searchPaintings(POOL, 'monet bridge').map((x) => x.id)).toEqual(['bridge'])
    expect(searchPaintings(POOL, '')).toEqual([])
  })
})

describe('guess feedback', () => {
  const answer = POOL[2] // The Bedroom, 1889
  it('compares year, artist and movement', () => {
    const r = compare(POOL[3], answer)
    expect(r).toMatchObject({ correct: false, yearDelta: 0, sameArtist: true, sameMovement: true, sameNationality: true })
    expect(compare(POOL[4], answer)).toMatchObject({ yearDelta: 227, sameArtist: false, sameMovement: false, sameNationality: true })
    expect(compare(answer, answer).correct).toBe(true)
  })
  it('grades closeness', () => {
    expect(paintingCloseness(compare(answer, answer))).toBe('hit')
    expect(paintingCloseness(compare(POOL[3], answer))).toBe('near')
    expect(paintingCloseness(compare(POOL[0], answer))).toBe('mid') // 17 years apart
    expect(paintingCloseness(compare(POOL[4], answer))).toBe('far')
    expect(paintingCloseness(compare(p('x', 'X', 'Y', 1700, 'Post-Impressionism'), answer))).toBe('mid')
  })
  it('says what a miss shares with the answer', () => {
    expect(matchHint(compare(POOL[3], answer))).toBe('RIGHT ARTIST, OTHER PAINTING')
    expect(matchHint(compare(POOL[5], answer))).toBe('SAME MOVEMENT')
    expect(matchHint(compare(POOL[4], answer))).toBe('SAME NATIONALITY')
    expect(matchHint(compare(p('x', 'X', 'Y', 1890, 'Post-Impressionism', 'Dutch'), answer))).toBe('SAME MOVEMENT & NATIONALITY')
    expect(matchHint(compare(POOL[0], answer))).toBe('DIFFERENT ARTIST & STYLE')
  })
  it('words the year gap from the answer', () => {
    expect(yearHint(12)).toBe('12Y LATER')
    expect(yearHint(-150)).toBe('150Y EARLIER')
    expect(yearHint(0)).toBe('SAME YEAR')
  })
  it('names centuries', () => {
    expect(century(1889)).toBe('19TH CENTURY')
    expect(century(1900)).toBe('19TH CENTURY')
    expect(century(1901)).toBe('20TH CENTURY')
    expect(century(1320)).toBe('14TH CENTURY')
    expect(century(2001)).toBe('21ST CENTURY')
  })
})

describe('palette share text', () => {
  it('shows tries and one square per guess, never the answer', () => {
    const answer = POOL[2]
    const results = [compare(POOL[4], answer), compare(POOL[0], answer), compare(answer, answer)]
    expect(paletteShareText(7, results, true)).toBe('PALETTE #7 3/6\n⬛🟧🟦')
    expect(paletteShareText(7, results.slice(0, 2), false)).toBe('PALETTE #7 X/6\n⬛🟧')
  })
})
