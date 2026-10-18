import { render } from 'preact'
import { useEffect, useState } from 'preact/hooks'
import { Contour } from './components/Contour'
import { Hub } from './components/Hub'
import { NightLights } from './components/NightLights'
import { Palette } from './components/Palette'
import { Spike } from './components/Spike'
import './styles.css'

const ROUTES: Record<string, () => preact.JSX.Element> = {
  '#/contour': Contour,
  '#/spike': Spike,
  '#/palette': Palette,
  '#/night-lights': NightLights,
}

function App() {
  const [route, setRoute] = useState(location.hash)
  useEffect(() => {
    const onHash = () => {
      setRoute(location.hash)
      window.scrollTo(0, 0)
    }
    addEventListener('hashchange', onHash)
    return () => removeEventListener('hashchange', onHash)
  }, [])
  const Game = ROUTES[route] ?? Hub
  return <Game />
}

render(<App />, document.getElementById('app')!)
