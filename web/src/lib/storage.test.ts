import { describe, expect, it } from 'vitest'
import { type Stats, currentStreak, recordFinish } from './storage'

const fresh: Stats = { played: 0, won: 0, streak: 0, best: 0 }

describe('streaks', () => {
  it('grows on consecutive wins and resets on a gap or loss', () => {
    let s = recordFinish('test', fresh, '2026-10-18', true)
    s = recordFinish('test', s, '2026-10-19', true)
    expect(s.streak).toBe(2)
    s = recordFinish('test', s, '2026-10-21', true)
    expect(s.streak).toBe(1)
    expect(s.best).toBe(2)
    s = recordFinish('test', s, '2026-10-22', false)
    expect(s.streak).toBe(0)
    expect(s.played).toBe(4)
    expect(s.won).toBe(3)
  })

  it('counts a day only once', () => {
    const s = recordFinish('test', fresh, '2026-10-18', true)
    expect(recordFinish('test', s, '2026-10-18', true)).toBe(s)
  })

  it('lapses when a day is missed', () => {
    const s = recordFinish('test', fresh, '2026-10-18', true)
    expect(currentStreak(s, '2026-10-19')).toBe(1)
    expect(currentStreak(s, '2026-10-20')).toBe(0)
  })
})
