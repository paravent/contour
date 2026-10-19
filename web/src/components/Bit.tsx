import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks'
import type { RefObject } from 'preact'
import './bit.css'

export type BitMood = 'idle' | 'wrong' | 'sleep' | 'happy' | 'sad' | 'nervous' | 'confused'

type Props = { mood?: BitMood; blink?: boolean; class?: string }

function Eyes({ mood }: { mood: BitMood }) {
  switch (mood) {
    case 'sleep':
      return <g class="bit-eyes"><rect x="8" y="11" width="3" height="1.5" /><rect x="13" y="11" width="3" height="1.5" /></g>
    case 'wrong':
      return <path class="bit-line" d="M8 9l3 2-3 2M16 9l-3 2 3 2" />
    case 'happy':
      return <path class="bit-line" d="M8 12l1.5-3 1.5 3M13 12l1.5-3 1.5 3" />
    case 'sad':
      return (
        <g>
          <g class="bit-eyes"><rect x="8" y="10" width="3" height="3" /><rect x="13" y="10" width="3" height="3" /></g>
          <path class="bit-line" d="M7.5 9l3.5-1.6M16.5 9l-3.5-1.6" />
        </g>
      )
    case 'nervous':
      return <g class="bit-eyes bit-eyes-open"><rect x="8.5" y="9" width="2" height="3" /><rect x="13.5" y="9" width="2" height="3" /></g>
    case 'confused':
      return <g class="bit-eyes"><rect x="8" y="7" width="3" height="6" /><rect x="13" y="9" width="3" height="3" /></g>
    default:
      return <g class="bit-eyes bit-eyes-open"><rect x="8" y="8" width="3" height="5" /><rect x="13" y="8" width="3" height="5" /></g>
  }
}

/** Bit, the deck's mascot: the terminal cursor with eyes, a fez and a moustache. */
export function Bit({ mood = 'idle', blink = true, class: cls = '' }: Props) {
  return (
    <svg class={`bit bit-${mood}${blink ? ' bit-blink' : ''} ${cls}`} viewBox="0 -7 24 39" aria-hidden="true">
      {mood === 'wrong' && <rect class="bit-ghost" x="6" y="2" width="16" height="25" />}
      <g class="bit-hat">
        <polygon class="bit-fez" points="7,2.5 17,2.5 15.5,-6 8.5,-6" />
        <rect class="bit-fez-band" x="7" y="0.5" width="10" height="1.5" />
        <path class="bit-tassel" d="M12 -6 Q16 -6 17 -1" />
        <rect class="bit-tassel-end" x="16.2" y="-1.5" width="1.6" height="3" />
      </g>
      <g class="bit-body">
        <rect x="6" y="26" width="3" height="5" />
        <rect x="15" y="26" width="3" height="5" />
        <rect x="4" y="2" width="16" height="25" />
        <rect x="2" y="13" width="2" height="5" />
        <rect x="20" y="13" width="2" height="5" />
      </g>
      <Eyes mood={mood} />
      <path
        class="bit-stache"
        d="M12 15.2C10 14 7 14.4 5.6 16.4C4.9 17.4 3.6 17.5 3 16.2C3.1 18.6 5.4 19.7 8 18.8C10 18.1 11.2 17.5 12 16.9C12.8 17.5 14 18.1 16 18.8C18.6 19.7 20.9 18.6 21 16.2C20.4 17.5 19.1 17.4 18.4 16.4C17 14.4 14 14 12 15.2Z"
      />
      {mood === 'sleep' && <text class="bit-z" x="20" y="-1">z</text>}
      {mood === 'confused' && <text class="bit-q" x="19" y="-2">?</text>}
      {mood === 'nervous' && <path class="bit-sweat" d="M21.5 3c1.2 1.6 1.8 2.6 1.8 3.4a1.8 1.8 0 0 1-3.6 0c0-.8.6-1.8 1.8-3.4z" />}
      {mood === 'happy' && (
        <g class="bit-sparks">
          <rect x="-1" y="-5" width="2" height="2" class="amber" />
          <rect x="23" y="-3" width="2" height="2" class="magenta" />
          <rect x="24" y="8" width="1.5" height="1.5" class="amber" />
        </g>
      )}
    </svg>
  )
}

let measurer: CanvasRenderingContext2D | null = null

function textWidth(text: string, font: string): number {
  measurer ??= document.createElement('canvas').getContext('2d')
  if (!measurer) return text.length * 9.6
  measurer.font = font
  return measurer.measureText(text).width
}

type CaretProps = {
  input: RefObject<HTMLInputElement>
  value: string
  misses: number
  /** Guesses allowed; Bit sweats when one is left. */
  max: number
  /** Whether the typed text matches anything; Bit is puzzled when it doesn't. */
  found: boolean
}

/** Bit standing in for the text caret of a guess field. He glitches on a wrong guess, sweats on the last one,
 *  is puzzled when nothing matches and fidgets with his fez while the field sits empty. */
export function BitCaret({ input, value, misses, max, found }: CaretProps) {
  const [x, setX] = useState(0)
  const [focused, setFocused] = useState(false)
  const [wrong, setWrong] = useState(false)
  const seen = useRef(misses)

  useLayoutEffect(() => {
    const el = input.current
    if (!el) return
    let frame = 0
    const place = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => {
        const s = getComputedStyle(el)
        const font = `${s.fontStyle} ${s.fontWeight} ${s.fontSize} ${s.fontFamily}`
        const upto = el.value.slice(0, el.selectionStart ?? el.value.length)
        const left = el.offsetLeft + textWidth(upto, font) - el.scrollLeft
        setX(Math.min(Math.max(left, el.offsetLeft), el.offsetLeft + el.clientWidth))
        setFocused(document.activeElement === el)
      })
    }
    place()
    const events = ['input', 'keyup', 'click', 'select', 'focus', 'blur', 'scroll']
    events.forEach((e) => el.addEventListener(e, place))
    document.addEventListener('selectionchange', place)
    window.addEventListener('resize', place)
    document.fonts?.ready.then(place)
    return () => {
      cancelAnimationFrame(frame)
      events.forEach((e) => el.removeEventListener(e, place))
      document.removeEventListener('selectionchange', place)
      window.removeEventListener('resize', place)
    }
  }, [input, value])

  useEffect(() => {
    if (misses <= seen.current) return
    seen.current = misses
    setWrong(true)
    const t = setTimeout(() => setWrong(false), 650)
    return () => clearTimeout(t)
  }, [misses])

  const mood: BitMood = wrong ? 'wrong' : value && !found ? 'confused' : misses === max - 1 ? 'nervous' : 'idle'

  return (
    <span class={`bit-caret${focused ? ' focused' : ''}${value ? '' : ' empty'}`} style={{ transform: `translateX(${x + 2}px)` }} aria-hidden="true">
      <Bit mood={mood} blink={focused && mood === 'idle'} />
    </span>
  )
}
