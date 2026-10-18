import { useMemo } from 'preact/hooks'
import { compact, monthStarts, niceTicks } from '../lib/spike'

type Props = {
  views: number[]
  start: string
  spikes: number[]
  showScale: boolean // stage 2: label the y axis
  showDates: boolean // stage 3: months along the x axis, numbered spike markers
  channel: string // top-right readout, e.g. "CH 02/06"
}

const W = 360
const H = 240
const PAD = { left: 38, right: 10, top: 34, bottom: 24 }
const GLOW_DAYS = 4 // days either side of a spike drawn in magenta

/** The pageview trace: a neon line on a monitor grid, with the spikes glowing magenta. */
export function SpikeChart({ views, start, spikes, showScale, showDates, channel }: Props) {
  const plotW = W - PAD.left - PAD.right
  const plotH = H - PAD.top - PAD.bottom
  const ticks = useMemo(() => niceTicks(Math.max(...views)), [views])
  const top = ticks[ticks.length - 1]
  const x = (i: number) => PAD.left + (i / (views.length - 1)) * plotW
  const y = (v: number) => PAD.top + plotH - (v / top) * plotH

  const line = useMemo(() => views.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(''), [views, top])
  const area = `${line}L${x(views.length - 1)} ${y(0)}L${x(0)} ${y(0)}Z`
  const glows = spikes.map((s) => {
    const from = Math.max(0, s - GLOW_DAYS)
    const to = Math.min(views.length - 1, s + GLOW_DAYS)
    return views.slice(from, to + 1).map((v, k) => `${k ? 'L' : 'M'}${x(from + k).toFixed(1)} ${y(v).toFixed(1)}`).join('')
  })
  const months = useMemo(() => monthStarts(start, views.length), [start, views.length])
  // Until the dates are revealed, the vertical grid is evenly spaced and says nothing.
  const verticals = showDates ? months.map((m) => x(m.index)) : Array.from({ length: 11 }, (_, k) => PAD.left + ((k + 1) / 12) * plotW)
  const last = views.length - 1

  return (
    <svg class="spike-chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Daily pageviews over one year">
      <defs>
        <linearGradient id="spike-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="#2DE2D0" stop-opacity="0.28" />
          <stop offset="1" stop-color="#2DE2D0" stop-opacity="0" />
        </linearGradient>
        <filter id="spike-glow" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="2.4" result="b" />
          <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
      </defs>

      {ticks.map((t) => (
        <g key={t}>
          <line x1={PAD.left} x2={W - PAD.right} y1={y(t)} y2={y(t)} class="spike-grid" />
          <text x={PAD.left - 6} y={y(t) + 3} text-anchor="end" class={showScale ? 'spike-axis reveal' : 'spike-axis'}>
            {showScale ? compact(t) : t === 0 ? '0' : '??'}
          </text>
        </g>
      ))}
      {verticals.map((vx, k) => <line key={k} x1={vx} x2={vx} y1={PAD.top} y2={y(0)} class="spike-grid" />)}

      {showDates
        ? months.filter((m) => x(m.index) < W - PAD.right - 18).map((m) => (
          <text key={m.index} x={x(m.index) + 2} y={H - 8} class="spike-axis reveal">{m.label}</text>
        ))
        : <text x={PAD.left + plotW / 2} y={H - 8} text-anchor="middle" class="spike-axis">◄ 365 DAYS ►</text>}

      <path d={area} fill="url(#spike-fill)" />
      <path d={line} class="spike-line" filter="url(#spike-glow)" pathLength={1} />
      {glows.map((d, k) => <path key={k} d={d} class="spike-hot" filter="url(#spike-glow)" />)}

      {showDates && spikes.map((s, k) => (
        <g key={s} class="reveal">
          <line x1={x(s)} x2={x(s)} y1={y(views[s]) - 4} y2={y(0)} class="spike-marker" />
          <text x={x(s)} y={Math.max(10, y(views[s]) - 8)} text-anchor="middle" class="spike-tag">{k + 1}</text>
        </g>
      ))}

      <text x={W - PAD.right} y={14} text-anchor="end" class="spike-axis reveal">{channel}</text>
      <text x={PAD.left} y={14} class="spike-axis">VIEWS/DAY</text>
      <circle cx={x(last)} cy={y(views[last])} r="2.6" class="spike-blip" />
    </svg>
  )
}
