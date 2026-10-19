import { useEffect, useState } from 'preact/hooks'
import { prefersReducedMotion } from '../lib/games'
import { Bit, type BitMood } from './Bit'

type Props = { text: string; delay?: number; speed?: number; class?: string; bit?: BitMood }

/** Terminal-style text that types itself out once, with a blinking caret (or Bit, when given a mood). */
export function Typed({ text, delay = 0, speed = 34, class: cls = '', bit }: Props) {
  const [n, setN] = useState(() => (prefersReducedMotion() ? text.length : 0))
  useEffect(() => {
    if (n >= text.length) return
    const t = setTimeout(() => setN((i) => i + 1), n === 0 ? delay : speed)
    return () => clearTimeout(t)
  }, [n, text, delay, speed])
  return (
    <span class={`typed ${cls}`} aria-label={text}>
      <span aria-hidden="true">{text.slice(0, n)}</span>
      {bit ? <Bit mood={bit} blink={bit === 'idle'} /> : <span class="caret" aria-hidden="true" />}
    </span>
  )
}
