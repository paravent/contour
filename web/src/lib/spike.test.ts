import { describe, expect, it } from 'vitest'
import { type Article, SPIKE_CLUES, STAGES, compact, monthStarts, nameShape, nextSpikeClue, niceTicks, searchArticles, shortDate, spikeShareText, verdict } from './spike'

const articles: Article[] = [
  { id: 'the-beatles', name: 'The Beatles', category: 'musician', aliases: ['Beatles'] },
  { id: 'beyonce', name: 'Beyoncé', category: 'musician', aliases: ['Beyonce'] },
  { id: 'christmas', name: 'Christmas', category: 'holiday', aliases: ['Xmas'] },
  { id: 'christmas-island', name: 'Christmas Island', category: 'place', aliases: [] },
  { id: 'a-christmas-story', name: 'A Christmas Story', category: 'film', aliases: [] },
  { id: 'super-bowl', name: 'Super Bowl', category: 'sports event', aliases: [] },
]

describe('article search', () => {
  it('ranks exact, prefix, word and substring matches', () => {
    expect(searchArticles(articles, 'christmas').map((a) => a.id)).toEqual(['christmas', 'christmas-island', 'a-christmas-story'])
    expect(searchArticles(articles, 'beatles')[0].id).toBe('the-beatles')
    expect(searchArticles(articles, 'beyonce')[0].id).toBe('beyonce')
    expect(searchArticles(articles, 'bowl').map((a) => a.id)).toEqual(['super-bowl'])
    expect(searchArticles(articles, '  ')).toEqual([])
  })
})

describe('clues', () => {
  it('counts letters per word, ignoring punctuation and qualifiers', () => {
    expect(nameShape('Taylor Swift')).toEqual([6, 5])
    expect(nameShape("Valentine's Day")).toEqual([10, 3])
    expect(nameShape('Halloween (1978 film)')).toEqual([9])
    expect(nameShape('Wicked: For Good')).toEqual([6, 3, 4])
    expect(nameShape('Jack-o\'-lantern')).toEqual([12])
    expect(nameShape('Super Mario Bros.')).toEqual([5, 5, 4])
  })

  it('makes round axis ticks', () => {
    expect(niceTicks(9300)).toEqual([0, 2500, 5000, 7500, 10000])
    expect(niceTicks(180000)).toEqual([0, 50000, 100000, 150000, 200000])
    expect(compact(1234)).toBe('1.2K')
    expect(compact(250000)).toBe('250K')
    expect(compact(2500000)).toBe('2.5M')
    expect(compact(800)).toBe('800')
  })

  it('labels dates and month starts', () => {
    expect(shortDate('2026-03-07')).toBe('7 MAR 26')
    expect(monthStarts('2026-01-30', 35)).toEqual([{ index: 2, label: 'FEB' }, { index: 30, label: 'MAR' }])
  })
})

describe('spike share text', () => {
  it('marks right-category misses and the hit', () => {
    const answer = { id: 'christmas', name: 'Christmas', category: 'holiday', description: '', extract: '', url: '', letter: 'C' }
    const vs = [articles[5], articles[3], articles[2]].map((a) => verdict(a, answer))
    expect(vs).toEqual(['miss', 'miss', 'hit'])
    expect(spikeShareText(12, ['miss', 'near', 'hit'], true)).toBe('SPIKE #12 3/6\n⬛🟨🟦')
    expect(spikeShareText(12, ['miss', 'near'], false)).toBe('SPIKE #12 X/6\n⬛🟨')
  })
})

describe('spike clue schedule', () => {
  it('shows the category from the first stage', () => {
    expect(SPIKE_CLUES.category).toBe(0)
  })

  it('unlocks exactly one new clue on every miss', () => {
    const stages = Object.values(SPIKE_CLUES).sort((a, b) => a - b)
    expect(stages).toEqual(Array.from({ length: STAGES }, (_, i) => i))
  })

  it('names what the next miss unlocks', () => {
    expect(nextSpikeClue(0)).toBe('Y-AXIS SCALE')
    expect(nextSpikeClue(2)).toBe('DESCRIPTION')
    expect(nextSpikeClue(4)).toBe('FIRST LETTER')
    expect(nextSpikeClue(STAGES - 1)).toBeNull()
  })
})
