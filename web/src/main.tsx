import { render } from 'preact'
import { useEffect, useState } from 'preact/hooks'
import { Contour } from './components/Contour'
import { Hub } from './components/Hub'
import { NightLights } from './components/NightLights'
import './styles.css'

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
  if (route === '#/night-lights') return <NightLights />
  return route === '#/contour' ? <Contour /> : <Hub />
}

render(<App />, document.getElementById('app')!)
