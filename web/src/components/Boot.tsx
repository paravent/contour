import { useEffect, useState } from 'preact/hooks'
import { Bit } from './Bit'
import { GAMES, prefersReducedMotion } from '../lib/games'

const KEY = 'daily:booted'
const LINE_MS = 120
const HOLD_MS = 260
const EXIT_MS = 520

const LINES = [
  'DAILY:// KERNEL 4.0.4',
  '> establishing uplink',
  ...GAMES.map((g) => `> mount ${g.n} ${g.name}`),
  '> wake bit',
  "> decrypting today's sheets",
]

function alreadyBooted(): boolean {
  try {
    return sessionStorage.getItem(KEY) === '1'
  } catch {
    return false
  }
}

/** A short boot sequence on the first visit of a session. Any key or tap skips it. */
export function Boot({ onDone }: { onDone: () => void }) {
  const [skip] = useState(() => alreadyBooted() || prefersReducedMotion())
  const [shown, setShown] = useState(0)
  const [leaving, setLeaving] = useState(false)
  const [gone, setGone] = useState(skip)

  useEffect(() => {
    if (skip) {
      onDone()
      return
    }
    try {
      sessionStorage.setItem(KEY, '1')
    } catch {
      /* ignore */
    }
  }, [])

  useEffect(() => {
    if (gone || leaving) return
    if (shown < LINES.length) {
      const t = setTimeout(() => setShown((n) => n + 1), shown === 0 ? 80 : LINE_MS)
      return () => clearTimeout(t)
    }
    const t = setTimeout(() => setLeaving(true), HOLD_MS)
    return () => clearTimeout(t)
  }, [shown, gone, leaving])

  useEffect(() => {
    if (!leaving) return
    onDone()
    const t = setTimeout(() => setGone(true), EXIT_MS)
    return () => clearTimeout(t)
  }, [leaving])

  useEffect(() => {
    if (gone) return
    const end = () => setLeaving(true)
    addEventListener('keydown', end)
    addEventListener('pointerdown', end)
    return () => {
      removeEventListener('keydown', end)
      removeEventListener('pointerdown', end)
    }
  }, [gone])

  if (gone) return null
  const progress = Math.min(1, shown / LINES.length)
  return (
    <div class={`boot-screen ${leaving ? 'leaving' : ''}`} aria-hidden="true">
      <div class="boot-inner">
        {LINES.slice(0, shown).map((l, i) => (
          <div key={i} class={`boot-line ${i === 0 ? 'cyan' : ''}`}>
            <span>{l}</span>
            {l === '> wake bit' ? (
              <Bit mood="happy" blink={false} />
            ) : (
              i > 0 && <span class={i === LINES.length - 1 ? 'magenta' : 'cyan'}>{i === LINES.length - 1 ? 'READY' : 'OK'}</span>
            )}
          </div>
        ))}
        <div class="boot-bar"><span style={{ transform: `scaleX(${progress})` }} /></div>
      </div>
    </div>
  )
}
