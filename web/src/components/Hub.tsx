import type { ComponentChildren } from 'preact'
import { useEffect, useState } from 'preact/hooks'
import { localDate, untilMidnight } from '../lib/day'
import { nightDir, loadNightPuzzle } from '../lib/nightLights'
import { loadLogosPuzzle, logosDir } from '../lib/logos'
import { puzzleDir } from '../lib/puzzle'
import { loadSpikePuzzle } from '../lib/spike'
import { currentStreak, loadDay, loadStats } from '../lib/storage'
import { StatusBar } from './StatusBar'
import { Typed } from './Typed'

/** What today's puzzles look like before the first guess, for the hub's cards. Nothing here gives an answer away. */
type Previews = { views?: number[]; logo?: { src: string; aspect: number; background: string }; night?: string }

function usePreviews(date: string): Previews {
  const [p, setP] = useState<Previews>({})
  useEffect(() => {
    const quiet = <T,>(x: Promise<T>) => x.catch(() => null)
    quiet(loadSpikePuzzle(date)).then((s) => s && setP((o) => ({ ...o, views: s.views })))
    quiet(loadLogosPuzzle(date)).then(
      (s) => s && s.stages[0] && setP((o) => ({ ...o, logo: { src: logosDir(date) + s.stages[0].image, aspect: s.aspect, background: s.background } })),
    )
    quiet(loadNightPuzzle(date)).then((s) => s && s.stages[0] && setP((o) => ({ ...o, night: nightDir(date) + s.stages[0].image })))
  }, [date])
  return p
}

const FALLBACK_VIEWS = Array.from({ length: 120 }, (_, i) => 10 + 3 * Math.sin(i / 9) + (i === 38 ? 60 : i === 37 || i === 39 ? 22 : 0) + (i === 92 ? 85 : i === 91 || i === 93 ? 30 : 0))
// An 8x4 grid of a made-up logo, for the card before today's puzzle has loaded.
const FALLBACK_LOGO = [
  '........',
  '..rrrr..',
  '.rr..yy.',
  '..yyyy..',
]
const LOGO_COLOURS: Record<string, string> = { r: '#E2363C', y: '#F5B82E' }

/** Pixels as an SVG, drawn crisp at any size. */
function PixelLogo({ rows, class: cls }: { rows: string[]; class?: string }) {
  return (
    <svg class={cls} viewBox={`0 0 ${rows[0].length} ${rows.length}`} preserveAspectRatio="xMidYMid meet" shape-rendering="crispEdges" aria-hidden="true">
      <rect width={rows[0].length} height={rows.length} fill="#FFFFFF" />
      {rows.flatMap((row, y) => [...row].map((c, x) => (LOGO_COLOURS[c] ? <rect key={`${x}-${y}`} x={x} y={y} width="1" height="1" fill={LOGO_COLOURS[c]} /> : null)))}
    </svg>
  )
}

/** A year of pageviews as a glowing trace, drawn into a 100x40 box. */
function Trace({ views }: { views: number[] }) {
  const step = Math.max(1, Math.floor(views.length / 120))
  const pts = views.filter((_, i) => i % step === 0)
  const top = Math.max(...pts)
  const d = pts.map((v, i) => `${i ? 'L' : 'M'}${((i / (pts.length - 1)) * 100).toFixed(2)} ${(38 - (v / top) * 34).toFixed(2)}`).join('')
  return (
    <svg class="hero-trace" viewBox="0 0 100 40" preserveAspectRatio="none" aria-hidden="true">
      <path d={`${d}L100 40L0 40Z`} class="hero-trace-fill" />
      <path d={d} class="hero-trace-line" pathLength={1} vector-effect="non-scaling-stroke" />
    </svg>
  )
}

/** Cards lean towards the cursor and light up under it. */
function tilt(e: PointerEvent) {
  if (e.pointerType !== 'mouse') return
  const el = e.currentTarget as HTMLElement
  const r = el.getBoundingClientRect()
  const x = (e.clientX - r.left) / r.width
  const y = (e.clientY - r.top) / r.height
  el.style.setProperty('--mx', `${(x * 100).toFixed(1)}%`)
  el.style.setProperty('--my', `${(y * 100).toFixed(1)}%`)
  el.style.setProperty('--rx', `${((0.5 - y) * 5).toFixed(2)}deg`)
  el.style.setProperty('--ry', `${((x - 0.5) * 7).toFixed(2)}deg`)
  el.style.setProperty('--px', `${((x - 0.5) * -14).toFixed(1)}px`)
  el.style.setProperty('--py', `${((y - 0.5) * -10).toFixed(1)}px`)
}
function untilt(e: PointerEvent) {
  const el = e.currentTarget as HTMLElement
  for (const k of ['--rx', '--ry', '--px', '--py']) el.style.removeProperty(k)
}
const fx = { onPointerMove: tilt, onPointerLeave: untilt }

/** What Bit says under the hub prompt, depending on how today's modules went. */
function bitLine(states: string[]): string {
  const left = states.filter((s) => s === 'playing').length
  if (left === states.length) return 'four fresh sheets today. start wherever you like.'
  if (left > 0) return `${left} to go. ${states.some((s) => s === 'lost') ? "shake off that last one." : "you're on a roll."}`
  if (states.every((s) => s === 'won')) return 'a perfect day. see you at the next drop.'
  return 'all done for today. see you at the next drop.'
}

const TAG = { playing: 'RUN', won: 'SOLVED', lost: 'REVIEW' } as const

type Module = { n: string; name: string; game: string; blurb: string; art: ComponentChildren; hero: ComponentChildren }

export function Hub() {
  const today = localDate()
  const day = loadDay('contour', today)
  const streak = currentStreak(loadStats('contour'), today)
  const previews = usePreviews(today)
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(t)
  }, [])

  // The three modules under Contour's card, each with one line on what you're guessing.
  const modules: Module[] = [
    {
      n: '02',
      name: 'SPIKE',
      game: 'spike',
      blurb: 'Name the Wikipedia article from a year of its traffic',
      art: (
        <svg width="64" height="22" viewBox="0 0 64 22" aria-hidden="true">
          <path d="M0 19 L14 18 L20 17 L24 6 L27 16 L36 15 L40 2 L43 15 L52 16 L64 17" fill="none" stroke="#6FE3B5" stroke-width="1.6" />
        </svg>
      ),
      hero: <Trace views={previews.views ?? FALLBACK_VIEWS} />,
    },
    {
      n: '03',
      name: 'LOGOS',
      game: 'logos',
      blurb: 'Name the brand from its pixelated logo',
      art: <PixelLogo rows={FALLBACK_LOGO} class="logo-art" />,
      hero: previews.logo ? (
        <span class="hero-logo" style={{ background: previews.logo.background }} aria-hidden="true">
          <img class="pixelated" src={previews.logo.src} alt="" draggable={false} style={{ aspectRatio: String(previews.logo.aspect) }} />
        </span>
      ) : (
        <span class="hero-logo" aria-hidden="true"><PixelLogo rows={FALLBACK_LOGO} /></span>
      ),
    },
    {
      n: '04',
      name: 'NIGHT LIGHTS',
      game: 'night-lights',
      blurb: 'Name the city from space at night',
      art: (
        <svg width="64" height="22" viewBox="0 0 64 22" aria-hidden="true">
          <circle cx="32" cy="11" r="9" fill="#F2C66D" opacity="0.2" /><circle cx="32" cy="11" r="4" fill="#F2C66D" />
          <circle cx="12" cy="16" r="2" fill="#F2C66D" opacity="0.8" /><circle cx="52" cy="6" r="2.5" fill="#F2C66D" opacity="0.8" />
        </svg>
      ),
      hero: previews.night ? (
        <img class="hero-night" src={previews.night} alt="" draggable={false} />
      ) : (
        <svg class="hero-night" viewBox="0 0 200 80" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
          <defs>
            <radialGradient id="city-glow"><stop offset="0" stop-color="#F2C66D" stop-opacity="0.9" /><stop offset="1" stop-color="#F2C66D" stop-opacity="0" /></radialGradient>
          </defs>
          <circle cx="100" cy="40" r="30" fill="url(#city-glow)" /><circle cx="40" cy="60" r="9" fill="url(#city-glow)" />
          <circle cx="160" cy="22" r="12" fill="url(#city-glow)" /><circle cx="140" cy="62" r="6" fill="url(#city-glow)" />
        </svg>
      ),
    },
  ]

  const games = ['contour', ...modules.map((m) => m.game)]
  const states = games.map((g) => loadDay(g, today).status)
  const playedToday = states.filter((s) => s !== 'playing').length

  return (
    <main class="deck hub">
      <StatusBar left="DAILY://ROOT" middle={today.replaceAll('-', '.')} right="ONLINE" tone="solved" />

      <header class="hub-head">
        <div class="stack hero">
          <div class="dim small"><Typed text="$ load --daily" delay={350} bit={playedToday === games.length ? 'sleep' : 'idle'} /></div>
          <h1 class="hero-title glitch-in">TODAY'S<br /><span class="magenta glow-magenta">FOUR MODULES</span></h1>
          <div class="dim small hub-sub">Same puzzles for every player. Next drop in <span class="amber">{untilMidnight(now)}</span>.</div>
          <div class="small bit-says"><span class="bit-says-name">bit ›</span> {bitLine(states)}</div>
        </div>
        <div class="hub-stats rise" style={{ '--i': 1 }}>
          <div class="hub-stat">
            <span class="dim small">NEXT DROP</span>
            <span class="hub-clock amber">{untilMidnight(now)}</span>
          </div>
          <div class="hub-stat">
            <span class="dim small">PLAYED TODAY {playedToday}/{games.length}</span>
            <span class="hub-cells" aria-hidden="true">
              {states.map((s, i) => <span key={i} class={s === 'playing' ? '' : s === 'won' ? 'won' : 'lost'} />)}
            </span>
          </div>
          <div class="hub-stat">
            <span class="dim small">STREAK</span>
            <span class="hub-streak">{String(streak).padStart(3, '0')}</span>
          </div>
        </div>
      </header>

      <div class="hub-grid">
        <a href="#/contour" class="module-card fx rise" style={{ '--i': 2 }} {...fx}>
          <div class="row between center">
            <div class="row gap baseline">
              <span class="dim small">01</span>
              <span class="module-name cyan">CONTOUR</span>
            </div>
            <span class="tag">{TAG[day.status]}</span>
          </div>
          <div class="module-art">
            <img src={`${puzzleDir(today)}stage1.svg`} alt="" draggable={false} onError={(e) => ((e.target as HTMLImageElement).style.visibility = 'hidden')} />
            <div class="scanlines" />
            <span class="bracket tl" /><span class="bracket tr" /><span class="bracket bl" /><span class="bracket br" />
            <div class="hud tl-text module-art-hud">LAT ??.????<br />LON ???.????</div>
            <div class="module-launch" aria-hidden="true">ENTER ▸</div>
          </div>
          <div class="row between small">
            <span class="dim">Name the country from its terrain</span>
            <span class="amber">STREAK {String(streak).padStart(3, '0')}</span>
          </div>
        </a>

        <div class="module-list">
          {modules.map((m, i) => (
            <a key={m.n} href={`#/${m.game}`} class={`module-row live fx rise module-${m.game}`} style={{ '--i': i + 3 }} {...fx}>
              <span class="dim small module-row-n">{m.n}</span>
              <span class="module-row-text">
                <span class="module-row-name cyan">{m.name}</span>
                <span class="module-row-blurb">{m.blurb}</span>
              </span>
              <span class="module-row-art">{m.art}</span>
              <span class="module-row-hero">
                {m.hero}
                <span class="module-launch" aria-hidden="true">ENTER ▸</span>
              </span>
              <span class="tag">{TAG[states[i + 1]]}</span>
            </a>
          ))}
        </div>
      </div>

      <div class="push" />
      <div class="row between dim small hub-foot">
        <span>MODULES {games.length}/4 ONLINE</span>
        <span class="hub-keys"><kbd>1</kbd>–<kbd>4</kbd> LAUNCH <span class="dim">·</span> <kbd>ESC</kbd> BACK TO HUB</span>
        <span>PLAYED TODAY {playedToday}/{games.length}</span>
      </div>
    </main>
  )
}
