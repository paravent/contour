import type { ComponentChildren } from 'preact'
import { useEffect, useState } from 'preact/hooks'

type Props = {
  /** Remembers that this player has seen this game's briefing. */
  storageKey: string
  title: string
  steps: ComponentChildren[]
  start: string
  open?: boolean
  onClose?: () => void
}

function seen(key: string): boolean {
  try {
    return localStorage.getItem(key) === '1'
  } catch {
    return false
  }
}

/** A how-to-play panel: opens by itself on a player's first visit, and again from a "?" button. */
export function Briefing({ storageKey, title, steps, start, open, onClose }: Props) {
  const [firstVisit, setFirstVisit] = useState(() => !seen(storageKey))
  const visible = open || firstVisit

  const close = () => {
    try {
      localStorage.setItem(storageKey, '1')
    } catch {
      /* ignore */
    }
    setFirstVisit(false)
    onClose?.()
  }

  useEffect(() => {
    if (!visible) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close()
    addEventListener('keydown', onKey)
    return () => removeEventListener('keydown', onKey)
  }, [visible])

  if (!visible) return null
  return (
    <div class="briefing-backdrop" onClick={(e) => e.target === e.currentTarget && close()}>
      <section class="briefing" role="dialog" aria-modal="true" aria-labelledby="briefing-title">
        <div class="dim small">// MISSION BRIEFING</div>
        <h2 id="briefing-title" class="briefing-title glow-cyan">{title}</h2>
        <ol class="briefing-steps">
          {steps.map((s, i) => (
            <li key={i}>
              <span class="magenta">{String(i + 1).padStart(2, '0')}</span>
              <span>{s}</span>
            </li>
          ))}
        </ol>
        <button type="button" class="exec wide" onClick={close} autofocus>{start}</button>
      </section>
    </div>
  )
}

export function HelpButton({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" class="help" onClick={onClick} aria-label="How to play">?</button>
  )
}
