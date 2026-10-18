import { localDate } from '../lib/day'
import { GAMES, type GameInfo } from '../lib/games'
import { loadDay } from '../lib/storage'

const DOT = { playing: 'live', won: 'solved', lost: 'lost' } as const

/** The bar above every game: an obvious way home, and a switcher to jump between the four games. */
export function GameNav({ current }: { current: GameInfo }) {
  const today = localDate()
  return (
    <nav class="gamenav" aria-label="Daily games">
      <a href="#/" class="gamenav-home" aria-label="Back to all games">
        <span class="gamenav-chevron" aria-hidden="true">‹</span>
        <span class="gamenav-logo">DAILY<span class="magenta">://</span></span>
        <span class="gamenav-hub">HUB</span>
      </a>
      <div class="gamenav-tabs">
        {GAMES.map((g) => {
          const status = loadDay(g.id, today).status
          return (
            <a
              key={g.id}
              href={g.hash}
              class={`gamenav-tab tab-${g.id} ${g.id === current.id ? 'on' : ''}`}
              aria-current={g.id === current.id ? 'page' : undefined}
              title={`${g.name} · press ${Number(g.n)}`}
            >
              <span class={`gamenav-dot ${DOT[status]}`} aria-hidden="true" />
              <span class="gamenav-n">{g.n}</span>
              <span class="gamenav-name">{g.name}</span>
              <span class="gamenav-short">{g.short}</span>
            </a>
          )
        })}
      </div>
      <a href="#/" class="gamenav-esc" aria-hidden="true" tabIndex={-1}>
        <kbd>ESC</kbd> HUB
      </a>
    </nav>
  )
}
