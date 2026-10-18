import { render } from 'preact'
import { useEffect, useState } from 'preact/hooks'
import { Contour } from './components/Contour'
import { Hub } from './components/Hub'
import { Spike } from './components/Spike'
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
  if (route === '#/contour') return <Contour />
  if (route === '#/spike') return <Spike />
  return <Hub />
}

render(<App />, document.getElementById('app')!)
