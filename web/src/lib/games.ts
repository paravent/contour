/** The four daily games, in hub order. Used by the hub, the game switcher and the keyboard shortcuts. */
export const GAMES = [
  { id: 'contour', n: '01', name: 'CONTOUR', short: 'CONTOUR', hash: '#/contour' },
  { id: 'spike', n: '02', name: 'SPIKE', short: 'SPIKE', hash: '#/spike' },
  { id: 'palette', n: '03', name: 'PALETTE', short: 'PALETTE', hash: '#/palette' },
  { id: 'night-lights', n: '04', name: 'NIGHT LIGHTS', short: 'NIGHT', hash: '#/night-lights' },
] as const

export type GameInfo = (typeof GAMES)[number]

export const gameForHash = (hash: string): GameInfo | undefined => GAMES.find((g) => g.hash === hash)

export const prefersReducedMotion = (): boolean =>
  typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches
