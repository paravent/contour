import { useEffect, useRef } from 'preact/hooks'
import { localDate } from '../lib/day'

/** Small seeded PRNG, so the backdrop terrain is the same all day and changes at midnight. */
function rng(seed: string) {
  let h = 1779033703
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 3432918353)
  return () => {
    h = Math.imul(h ^ (h >>> 15), h | 1)
    h ^= h + Math.imul(h ^ (h >>> 7), h | 61)
    return ((h ^ (h >>> 14)) >>> 0) / 4294967296
  }
}

const LEVELS = 22
const CELL = 14 // px per marching-squares cell

/** Draws a contour map of a made-up terrain with marching squares. */
function drawTopo(canvas: HTMLCanvasElement, seed: string, lit: boolean) {
  const w = canvas.clientWidth
  const h = canvas.clientHeight
  if (!w || !h) return
  const dpr = Math.min(devicePixelRatio || 1, 2)
  canvas.width = Math.round(w * dpr)
  canvas.height = Math.round(h * dpr)
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  ctx.scale(dpr, dpr)

  const rand = rng(seed)
  const s = Math.max(w, h)
  const hills = Array.from({ length: 9 }, () => ({
    x: rand() * w,
    y: rand() * h,
    r: s * (0.07 + rand() * 0.16),
    a: (rand() < 0.25 ? -0.6 : 1) * (0.5 + rand()),
  }))
  const wave = [rand() * 6, rand() * 6, rand() * 6]
  const cols = Math.ceil(w / CELL) + 1
  const rows = Math.ceil(h / CELL) + 1
  const f = new Float32Array(cols * rows)
  let lo = Infinity
  let hi = -Infinity
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      const x = i * CELL
      const y = j * CELL
      let v = 0.18 * Math.sin(x / s * 9 + wave[0]) * Math.cos(y / s * 7 + wave[1]) + 0.08 * Math.sin((x + y) / s * 23 + wave[2])
      for (const k of hills) v += k.a * Math.exp(-((x - k.x) ** 2 + (y - k.y) ** 2) / (2 * k.r * k.r))
      f[j * cols + i] = v
      lo = Math.min(lo, v)
      hi = Math.max(hi, v)
    }
  }

  const step = (hi - lo) / (LEVELS + 1)
  ctx.lineJoin = 'round'
  for (let n = 1; n <= LEVELS; n++) {
    const L = lo + n * step
    const index = n % 5 === 0
    ctx.beginPath()
    for (let j = 0; j < rows - 1; j++) {
      for (let i = 0; i < cols - 1; i++) {
        const a = f[j * cols + i]
        const b = f[j * cols + i + 1]
        const c = f[(j + 1) * cols + i + 1]
        const d = f[(j + 1) * cols + i]
        const k = (a > L ? 8 : 0) | (b > L ? 4 : 0) | (c > L ? 2 : 0) | (d > L ? 1 : 0)
        if (k === 0 || k === 15) continue
        const x0 = i * CELL
        const y0 = j * CELL
        const top = () => [x0 + ((L - a) / (b - a)) * CELL, y0]
        const right = () => [x0 + CELL, y0 + ((L - b) / (c - b)) * CELL]
        const bottom = () => [x0 + ((L - d) / (c - d)) * CELL, y0 + CELL]
        const left = () => [x0, y0 + ((L - a) / (d - a)) * CELL]
        const seg = (p: number[], q: number[]) => {
          ctx.moveTo(p[0], p[1])
          ctx.lineTo(q[0], q[1])
        }
        switch (k) {
          case 1: case 14: seg(left(), bottom()); break
          case 2: case 13: seg(bottom(), right()); break
          case 3: case 12: seg(left(), right()); break
          case 4: case 11: seg(top(), right()); break
          case 6: case 9: seg(top(), bottom()); break
          case 7: case 8: seg(left(), top()); break
          case 5: seg(left(), top()); seg(bottom(), right()); break
          case 10: seg(top(), right()); seg(left(), bottom()); break
        }
      }
    }
    const alpha = lit ? (index ? 0.75 : 0.38) : index ? 0.13 : 0.06
    ctx.strokeStyle = n === LEVELS - 2 && lit ? `rgba(255, 46, 136, ${alpha})` : `rgba(45, 226, 208, ${alpha})`
    ctx.lineWidth = index ? 1.2 : 0.8
    ctx.stroke()
  }
}

/**
 * The page's backdrop: today's made-up terrain as faint contour lines, slowly drifting,
 * with a sweeping scan line, and on desktop a lens that lights the terrain up around the cursor.
 */
export function Backdrop() {
  const root = useRef<HTMLDivElement>(null)
  const base = useRef<HTMLCanvasElement>(null)
  const lit = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const seed = `daily:${localDate()}`
    let width = 0
    const draw = () => {
      if (Math.abs(innerWidth - width) < 40) return
      width = innerWidth
      if (base.current) drawTopo(base.current, seed, false)
      if (lit.current) drawTopo(lit.current, seed, true)
    }
    draw()
    let t: number | undefined
    const onResize = () => {
      clearTimeout(t)
      t = window.setTimeout(draw, 200)
    }

    let frame = 0
    const onMove = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse' || frame) return
      frame = requestAnimationFrame(() => {
        frame = 0
        const el = root.current
        if (!el) return
        el.style.setProperty('--gx', `${e.clientX}px`)
        el.style.setProperty('--gy', `${e.clientY}px`)
        el.classList.add('lens-on')
      })
    }
    const onLeave = () => root.current?.classList.remove('lens-on')

    addEventListener('resize', onResize)
    addEventListener('pointermove', onMove, { passive: true })
    document.documentElement.addEventListener('pointerleave', onLeave)
    return () => {
      removeEventListener('resize', onResize)
      removeEventListener('pointermove', onMove)
      document.documentElement.removeEventListener('pointerleave', onLeave)
      cancelAnimationFrame(frame)
      clearTimeout(t)
    }
  }, [])

  return (
    <div class="backdrop" ref={root} aria-hidden="true">
      <div class="topo-drift"><canvas class="topo" ref={base} /></div>
      <div class="topo-lens"><div class="topo-drift"><canvas class="topo" ref={lit} /></div></div>
      <div class="backdrop-glow" />
      <div class="backdrop-scan" />
      <div class="backdrop-vignette" />
    </div>
  )
}
