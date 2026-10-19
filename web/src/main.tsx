import { render } from 'preact'
import { useEffect, useState } from 'preact/hooks'
import { Backdrop } from './components/Backdrop'
import { Boot } from './components/Boot'
import { Contour } from './components/Contour'
import { GameNav } from './components/GameNav'
import { Hub } from './components/Hub'
import { Logos } from './components/Logos'
import { NightLights } from './components/NightLights'
import { Spike } from './components/Spike'
import { GAMES, gameForHash, prefersReducedMotion } from './lib/games'
import './styles.css'
import './motion.css'
import './shell.css'

const ROUTES: Record<string, () => preact.JSX.Element> = {
  '#/contour': Contour,
  '#/spike': Spike,
  '#/logos': Logos,
  '#/night-lights': NightLights,
}

type ViewTransitionDoc = Document & { startViewTransition?: (update: () => Promise<void>) => unknown }

const canMorph = () => typeof (document as ViewTransitionDoc).startViewTransition === 'function' && !prefersReducedMotion()

function isTyping(target: EventTarget | null): target is HTMLElement {
  return target instanceof HTMLElement && !!target.closest('input, textarea, select, [contenteditable="true"]')
}

function App() {
  const [route, setRoute] = useState(location.hash)
  const [booting, setBooting] = useState(true)

  useEffect(() => {
    const show = (hash: string) => {
      setRoute(hash)
      window.scrollTo(0, 0)
    }
    const onHash = () => {
      const hash = location.hash
      if (!canMorph()) return show(hash)
      // Cross-fade between screens; the next screen renders before the new frame is captured.
      ;(document as ViewTransitionDoc).startViewTransition!(async () => {
        show(hash)
        await new Promise((r) => setTimeout(r, 0))
      })
    }
    addEventListener('hashchange', onHash)
    return () => removeEventListener('hashchange', onHash)
  }, [])

  // Escape goes back to the hub; 1-4 jump straight to a game.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (booting || e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey) return
      if (document.querySelector('[role="dialog"]')) return // Escape closes the briefing first
      if (isTyping(e.target)) {
        // Escape in an empty guess box lets go of it, so the next Escape goes home.
        if (e.key === 'Escape' && e.target instanceof HTMLInputElement && !e.target.value) e.target.blur()
        return
      }
      if (e.key === 'Escape' && gameForHash(route)) {
        location.hash = '#/'
      } else if (/^[1-4]$/.test(e.key)) {
        const game = GAMES[Number(e.key) - 1]
        if (location.hash !== game.hash) location.hash = game.hash
      }
    }
    // Capture phase, so the guess box's own Escape (which clears it) hasn't run yet.
    addEventListener('keydown', onKey, true)
    return () => removeEventListener('keydown', onKey, true)
  }, [route, booting])

  useEffect(() => {
    document.documentElement.classList.toggle('booting', booting)
  }, [booting])

  const game = gameForHash(route)
  const Screen = ROUTES[route] ?? Hub
  return (
    <>
      <Backdrop />
      {game && <GameNav current={game} />}
      <div class={`route ${canMorph() ? '' : 'route-enter'}`} key={route || '#/'}>
        <Screen />
      </div>
      <Boot onDone={() => setBooting(false)} />
    </>
  )
}

render(<App />, document.getElementById('app')!)
