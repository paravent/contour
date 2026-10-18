import { useEffect, useState } from 'preact/hooks'
import { localDate, untilMidnight } from '../lib/day'
import { puzzleDir } from '../lib/puzzle'
import { currentStreak, loadDay, loadStats } from '../lib/storage'
import { StatusBar } from './StatusBar'

const OFFLINE = [
  {
    n: '02',
    name: 'SPIKE',
    art: (
      <svg width="64" height="22" viewBox="0 0 64 22" aria-hidden="true">
        <path d="M0 19 L14 18 L20 17 L24 6 L27 16 L36 15 L40 2 L43 15 L52 16 L64 17" fill="none" stroke="#6FE3B5" stroke-width="1.6" />
      </svg>
    ),
  },
  {
    n: '03',
    name: 'PALETTE',
    art: (
      <div class="palette" aria-hidden="true">
        <span style={{ background: '#1F3B5C' }} /><span style={{ background: '#D9A441' }} /><span style={{ background: '#B5462F' }} /><span style={{ background: '#E8DCC2' }} /><span style={{ background: '#3C5A3A' }} />
      </div>
    ),
  },
  {
    n: '04',
    name: 'NIGHT LIGHTS',
    art: (
      <svg width="64" height="22" viewBox="0 0 64 22" aria-hidden="true">
        <circle cx="32" cy="11" r="9" fill="#F2C66D" opacity="0.2" /><circle cx="32" cy="11" r="4" fill="#F2C66D" />
        <circle cx="12" cy="16" r="2" fill="#F2C66D" opacity="0.8" /><circle cx="52" cy="6" r="2.5" fill="#F2C66D" opacity="0.8" />
      </svg>
    ),
  },
]

export function Hub() {
  const today = localDate()
  const day = loadDay(today)
  const streak = currentStreak(loadStats(), today)
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(t)
  }, [])

  const played = day.status !== 'playing'

  return (
    <main class="deck">
      <StatusBar left="DAILY://ROOT" middle={today.replaceAll('-', '.')} right="ONLINE" tone="solved" />

      <div class="stack hero">
        <div class="dim small">$ load --daily</div>
        <h1 class="hero-title">TODAY'S<br /><span class="magenta glow-magenta">FOUR MODULES</span></h1>
        <div class="dim small">Same puzzles for every player. Next drop in <span class="amber">{untilMidnight(now)}</span>.</div>
      </div>

      <a href="#/contour" class="module-card">
        <div class="row between center">
          <div class="row gap baseline">
            <span class="dim small">01</span>
            <span class="module-name cyan">CONTOUR</span>
          </div>
          <span class="tag">{played ? (day.status === 'won' ? 'SOLVED' : 'REVIEW') : 'RUN'}</span>
        </div>
        <div class="module-art">
          <img src={`${puzzleDir(today)}stage1.svg`} alt="" onError={(e) => ((e.target as HTMLImageElement).style.visibility = 'hidden')} />
          <div class="scanlines" />
        </div>
        <div class="row between small">
          <span class="dim">Name the country from its terrain</span>
          <span class="amber">STREAK {String(streak).padStart(3, '0')}</span>
        </div>
      </a>

      <div class="module-list">
        {OFFLINE.map((m) => (
          <div key={m.n} class="module-row">
            <span class="dim small">{m.n}</span>
            <span class="module-row-name">{m.name}</span>
            {m.art}
            <span class="dim small">OFFLINE</span>
          </div>
        ))}
      </div>

      <div class="push" />
      <div class="row between dim small">
        <span>MODULES 1/4 ONLINE</span>
        <span>PLAYED TODAY {played ? 1 : 0}/1</span>
      </div>
    </main>
  )
}
