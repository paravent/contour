import { useState } from 'preact/hooks'
import { type Bounds, fractionToLonLat, haversineKm, lonLatToFraction, pinScore } from '../lib/geo'
import type { Answer } from '../lib/puzzle'
import type { Pin } from '../lib/storage'

type Props = {
  image: string
  bounds: Bounds
  widthKm: number
  answer: Answer
  pin?: Pin
  onLock: (pin: Pin) => void
}

export function PinMap({ image, bounds, widthKm, answer, pin, onLock }: Props) {
  const [draft, setDraft] = useState<{ fx: number; fy: number } | null>(null)

  const place = (e: MouseEvent) => {
    if (pin) return
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
    setDraft({ fx: (e.clientX - r.left) / r.width, fy: (e.clientY - r.top) / r.height })
  }

  const lock = () => {
    if (!draft) return
    const { lat, lon } = fractionToLonLat(draft.fx, draft.fy, bounds)
    const km = haversineKm(lat, lon, answer.lat, answer.lon)
    onLock({ lat, lon, km, score: pinScore(km, widthKm) })
  }

  const mine = pin ? lonLatToFraction(pin.lon, pin.lat, bounds) : draft
  const truth = pin ? lonLatToFraction(answer.lon, answer.lat, bounds) : null

  return (
    <div class="stack">
      <div class="dim small amber">// BONUS: LOCK THE EXACT COORDINATES</div>
      <div
        class={`map ${pin ? '' : 'clickable'}`}
        onClick={place}
        role="img"
        aria-label={pin ? `Your pin landed ${Math.round(pin.km)} km from ${answer.place}` : 'Tap the map to drop a pin'}
      >
        <img src={image} alt="" draggable={false} />
        <div class="scanlines" />
        <svg class="overlay" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
          {mine && truth && (
            <line x1={mine.fx * 100} y1={mine.fy * 100} x2={truth.fx * 100} y2={truth.fy * 100} class="pin-line" vector-effect="non-scaling-stroke" />
          )}
        </svg>
        {mine && <div class="marker mine" style={{ left: `${mine.fx * 100}%`, top: `${mine.fy * 100}%` }} />}
        {truth && <div class="marker truth" style={{ left: `${truth.fx * 100}%`, top: `${truth.fy * 100}%` }} />}
        {!pin && !draft && <div class="map-hint">TAP TO DROP A PIN</div>}
      </div>
      {pin ? (
        <div class="row between baseline">
          <span class="dim small">DELTA {pin.km < 10 ? pin.km.toFixed(1) : Math.round(pin.km).toLocaleString()}KM · {answer.place.toUpperCase()}</span>
          <span class="score">{pin.score.toLocaleString()}<span class="dim small">/5000</span></span>
        </div>
      ) : (
        <button type="button" class="exec wide" disabled={!draft} onClick={lock}>LOCK PIN</button>
      )}
    </div>
  )
}
