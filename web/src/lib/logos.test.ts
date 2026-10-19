import { describe, expect, it } from 'vitest'
import {
  type Brand,
  type BrandAnswer,
  brandCloseness,
  brandHint,
  compareBrand,
  decade,
  decodeBrand,
  foundedHint,
  logosShareText,
  searchBrands,
} from './logos'

const b = (id: string, name: string, industry: string, country: string, founded: number, aliases: string[] = []): Brand => ({
  id,
  name,
  aliases,
  industry,
  country,
  founded,
})

const POOL = [
  b('mcdonalds', "McDonald's", 'Fast food', 'United States', 1940, ['McDonalds']),
  b('kfc', 'KFC', 'Fast food', 'United States', 1952, ['Kentucky Fried Chicken']),
  b('nandos', "Nando's", 'Fast food', 'South Africa', 1987, ['Nandos']),
  b('mercedes-benz', 'Mercedes-Benz', 'Cars', 'Germany', 1926, ['Mercedes']),
  b('skoda', 'Škoda', 'Cars', 'Czech Republic', 1895, ['Skoda']),
  b('adidas', 'Adidas', 'Sportswear', 'Germany', 1949),
  b('7up', '7 Up', 'Drinks', 'United States', 1929, ['Seven Up']),
  b('seven-eleven', '7-Eleven', 'Retail', 'United States', 1927, ['Seven Eleven']),
  b('home-depot', 'The Home Depot', 'Retail', 'United States', 1978, ['Home Depot']),
]

const answer = (brand: Brand): BrandAnswer => {
  const { aliases: _aliases, ...rest } = brand
  return { ...rest, letter: brand.name[0].toUpperCase(), credit: 'Wikimedia Commons', licence: 'Public domain', source: 'https://commons.wikimedia.org/wiki/File:X.svg' }
}

describe('brand search', () => {
  it('finds names with or without punctuation and accents', () => {
    expect(searchBrands(POOL, 'mcdonalds').map((x) => x.id)).toEqual(['mcdonalds'])
    expect(searchBrands(POOL, "mcdonald's").map((x) => x.id)).toEqual(['mcdonalds'])
    expect(searchBrands(POOL, 'skoda').map((x) => x.id)).toEqual(['skoda'])
    expect(searchBrands(POOL, 'mercedes benz').map((x) => x.id)).toEqual(['mercedes-benz'])
  })
  it('searches aliases', () => {
    expect(searchBrands(POOL, 'kentucky').map((x) => x.id)).toEqual(['kfc'])
    expect(searchBrands(POOL, 'seven').map((x) => x.id)).toEqual(['7up', 'seven-eleven'])
    expect(searchBrands(POOL, '7').map((x) => x.id)).toEqual(['7up', 'seven-eleven'])
  })
  it('ranks exact names, then prefixes, then words', () => {
    expect(searchBrands(POOL, 'home').map((x) => x.id)).toEqual(['home-depot'])
    expect(searchBrands(POOL, 'depot').map((x) => x.id)).toEqual(['home-depot'])
    expect(searchBrands(POOL, 'kfc').map((x) => x.id)).toEqual(['kfc'])
    expect(searchBrands(POOL, '')).toEqual([])
  })
  it('only matches inside words from three letters', () => {
    expect(searchBrands(POOL, 'da').map((x) => x.id)).toEqual([])
    expect(searchBrands(POOL, 'das').map((x) => x.id)).toEqual(['adidas'])
  })
})

describe('guess feedback', () => {
  const target = answer(POOL[0]) // McDonald's: fast food, United States, 1940
  it('compares industry, country and founding year', () => {
    expect(compareBrand(POOL[1], target)).toMatchObject({ correct: false, sameIndustry: true, sameCountry: true, foundedDelta: -12 })
    expect(compareBrand(POOL[2], target)).toMatchObject({ sameIndustry: true, sameCountry: false })
    expect(compareBrand(POOL[6], target)).toMatchObject({ sameIndustry: false, sameCountry: true, foundedDelta: 11 })
    expect(compareBrand(POOL[0], target).correct).toBe(true)
  })
  it('grades closeness and words the hint', () => {
    expect(brandCloseness(compareBrand(POOL[0], target))).toBe('hit')
    expect(brandCloseness(compareBrand(POOL[1], target))).toBe('near')
    expect(brandCloseness(compareBrand(POOL[2], target))).toBe('mid')
    expect(brandCloseness(compareBrand(POOL[6], target))).toBe('mid')
    expect(brandCloseness(compareBrand(POOL[5], target))).toBe('far')
    expect(brandHint(compareBrand(POOL[1], target))).toBe('SAME INDUSTRY & COUNTRY')
    expect(brandHint(compareBrand(POOL[2], target))).toBe('SAME INDUSTRY')
    expect(brandHint(compareBrand(POOL[6], target))).toBe('SAME COUNTRY')
    expect(brandHint(compareBrand(POOL[5], target))).toBe('DIFFERENT INDUSTRY & COUNTRY')
  })
  it('words the founding gap and decade', () => {
    expect(foundedHint(12)).toBe('FOUNDED 12Y LATER')
    expect(foundedHint(-40)).toBe('FOUNDED 40Y EARLIER')
    expect(foundedHint(0)).toBe('FOUNDED SAME YEAR')
    expect(decade(1976)).toBe('1970S')
    expect(decade(2000)).toBe('2000S')
    expect(decade(1759)).toBe('1750S')
  })
})

describe('logos secret and share text', () => {
  it('decodes the secret, accents and all', () => {
    const secret = { ...answer(POOL[4]), letter: 'S' }
    const encoded = btoa(String.fromCharCode(...new TextEncoder().encode(JSON.stringify(secret))))
    expect(decodeBrand(encoded)).toEqual(secret)
  })
  it('shows tries and one square per guess, never the answer', () => {
    const target = answer(POOL[0])
    const results = [compareBrand(POOL[5], target), compareBrand(POOL[2], target), compareBrand(POOL[0], target)]
    expect(logosShareText(4, results, true)).toBe('▮ LOGOS #4 3/6\n⬛🟧🟦')
    expect(logosShareText(4, results.slice(0, 2), false)).toBe('▮ LOGOS #4 X/6\n⬛🟧')
    expect(logosShareText(4, results, true)).not.toMatch(/mcdonald/i)
  })
})
