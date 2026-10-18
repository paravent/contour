/** The player's local calendar date as YYYY-MM-DD; puzzles change at local midnight. */
export function localDate(now: Date = new Date()): string {
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const d = String(now.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export function addDays(date: string, days: number): string {
  const t = new Date(`${date}T00:00:00Z`)
  t.setUTCDate(t.getUTCDate() + days)
  return t.toISOString().slice(0, 10)
}

/** hh:mm:ss until the next local midnight. */
export function untilMidnight(now: Date = new Date()): string {
  const next = new Date(now)
  next.setHours(24, 0, 0, 0)
  const s = Math.max(0, Math.floor((next.getTime() - now.getTime()) / 1000))
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(Math.floor(s / 3600))}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}`
}
