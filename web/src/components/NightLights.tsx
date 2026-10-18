import { useEffect, useMemo, useState } from 'preact/hooks'
import { localDate, untilMidnight } from '../lib/day'
import { bearingDeg, compass, haversineKm } from '../lib/geo'
import {
  COUNTRY_HINT_STAGE,
  type City,
  type CityGuess,
  GAME,
  MAX_GUESSES,
  type NightPuzzle,
  cityCloseness,
  decodeNightAnswer,
  loadCities,
  loadNightPuzzle,
  nightDir,
  nightShareText,
} from '../lib/nightLights'
import { type DayState, currentStreak, loadDay, loadStats, recordFinish, saveDay } from '../lib/storage'
import { Briefing, HelpButton } from './Briefing'
import { CityInput } from './CityInput'
import { StatusBar } from './StatusBar'

const ARROW_ROTATION: Record<string, number> = { N: 0, NE: 45, E: 90, SE: 135, S: 180, SW: 225, W: 270, NW: 315 }

function scaleBar(widthKm: number) {
  const nice = [5, 10, 20, 50, 100, 200, 500]
  const km = nice.filter((n) => n <= widthKm / 4).pop() ?? 5
  return { km, pct: (km / widthKm) * 100 }
}

function useClock() {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(t)
  }, [])
  return now
}

export function NightLights() {
  const date = useMemo(() => localDate(), [])
  const [puzzle, setPuzzle] = useState<NightPuzzle | null | undefined>(undefined)
  const [cities, setCities] = useState<City[]>([])
  const [day, setDay] = useState<DayState>(() => loadDay(GAME, date))
  const [stats, setStats] = useState(() => loadStats(GAME))
  const [copied, setCopied] = useState(false)
  const [help, setHelp] = useState(false)
  const [loadedImage, setLoadedImage] = useState('')
  // Which stage a finished player is looking at: by default a mid view, the city in its surroundings.
  const [review, setReview] = useState(2)
  const now = useClock()

  useEffect(() => {
    loadNightPuzzle(date).then(setPuzzle).catch(() => setPuzzle(null))
    loadCities().then(setCities).catch(() => setCities([]))
  }, [date])

  const answer = useMemo(() => (puzzle ? decodeNightAnswer(puzzle.secret) : null), [puzzle])
  const byId = useMemo(() => new Map(cities.map((c) => [c.id, c])), [cities])

  const results: CityGuess[] = useMemo(() => {
    if (!answer) return []
    return day.guesses.flatMap((id) => {
      const c = byId.get(id)
      if (!c) return []
      const correct = id === answer.cityId
      return [{
        id,
        name: c.name,
        correct,
        km: correct ? 0 : haversineKm(c.lat, c.lon, answer.lat, answer.lon),
        direction: compass(bearingDeg(c.lat, c.lon, answer.lat, answer.lon)),
      }]
    })
  }, [day.guesses, answer, byId])

  if (puzzle === undefined) return <Shell><p class="dim boot">&gt; acquiring orbit…</p></Shell>
  if (puzzle === null || !answer) {
    return (
      <Shell>
        <StatusBar left="NIGHT://ORBIT" middle={date} right="NO SIGNAL" tone="lost" />
        <h1 class="title">NO SIGNAL</h1>
        <p class="dim">Tonight's pass isn't available yet. Check back shortly.</p>
        <a class="back" href="#/">&lt; BACK TO HUB</a>
      </Shell>
    )
  }

  const finished = day.status !== 'playing'
  const last = puzzle.stages.length - 1
  const stageIndex = finished ? Math.min(review, last) : Math.min(day.guesses.length, last)
  const stage = puzzle.stages[stageIndex]
  const dir = nightDir(puzzle.date)
  const bar = scaleBar(stage.widthKm)
  const streak = currentStreak(stats, date)
  const left = MAX_GUESSES - day.guesses.length

  const update = (next: DayState) => {
    setDay(next)
    saveDay(GAME, date, next)
  }

  const guess = (id: string) => {
    if (finished || day.guesses.includes(id)) return
    const guesses = [...day.guesses, id]
    const won = id === answer.cityId
    const status = won ? 'won' : guesses.length >= MAX_GUESSES ? 'lost' : 'playing'
    update({ ...day, guesses, status })
    if (status !== 'playing') {
      setStats(recordFinish(GAME, stats, date, won))
      setReview(2)
    }
  }

  const share = async () => {
    const text = nightShareText(puzzle.number, results, day.status === 'won')
    try {
      if (navigator.share) await navigator.share({ text })
      else {
        await navigator.clipboard.writeText(text)
        setCopied(true)
      }
    } catch {
      /* the player closed the share sheet */
    }
  }

  const tone = day.status === 'won' ? 'solved' : day.status === 'lost' ? 'lost' : 'live'
  const statusWord = day.status === 'won' ? 'SOLVED' : day.status === 'lost' ? 'LOST' : 'LIVE'

  return (
    <Shell>
      <StatusBar left="NIGHT://ORBIT" middle={`PASS_${String(puzzle.number).padStart(4, '0')}`} right={statusWord} tone={tone} />
      <Briefing
        storageKey="night-lights:briefed"
        title="NIGHT LIGHTS"
        open={help}
        onClose={() => setHelp(false)}
        start="BEGIN PASS"
        steps={[
          <>Each day a satellite photo of one city <span class="gold">at night</span>, the same for everyone. All you see is its light: streets, suburbs, highways and the dark of sea and desert.</>,
          <>Type a city to guess it. You have 6 guesses, and every answer is one of the cities in the list.</>,
          <>Each wrong guess pulls the camera back to show more: <span class="gold">neighbouring towns</span>, coastlines, other cities. Then the <span class="amber">country</span>, and finally the city's first letter.</>,
          <>Each wrong guess also shows how far the target is from your city and in which direction.</>,
          <>A new city lights up at midnight. Share your result, and keep your streak going.</>,
        ]}
      />

      {!finished && (
        <div class="row between end">
          <a href="#/" class="title glow-gold" aria-label="Night Lights, back to hub">NIGHT LIGHTS</a>
          <div class="row gap">
            <div class="readout right">
              <span class="dim small">STREAK</span>
              <span class="big amber">{String(streak).padStart(3, '0')}</span>
            </div>
            <HelpButton onClick={() => setHelp(true)} />
          </div>
        </div>
      )}

      {!finished && <p class="goal">Which city is glowing here?</p>}

      {finished && (
        <div class="stack tight">
          <div class="dim small">
            {day.status === 'won' ? `// CITY CONFIRMED · ATTEMPT ${String(day.guesses.length).padStart(2, '0')}/${String(MAX_GUESSES).padStart(2, '0')}` : '// SIGNAL LOST · THE CITY WAS'}
          </div>
          <h1 class={`answer ${day.status === 'won' ? 'glow-gold' : 'glow-magenta'}`}>{answer.city.toUpperCase()}</h1>
          <div class="dim small">{answer.countryName.toUpperCase()}</div>
        </div>
      )}

      <div class="map night-map" role="img" aria-label={`Satellite view of a city at night, ${stage.widthKm} km across, view ${stageIndex + 1} of ${puzzle.stages.length}`}>
        <img
          key={stage.image}
          class="fade-in"
          src={dir + stage.image}
          alt=""
          draggable={false}
          onLoad={() => setLoadedImage(stage.image)}
        />
        {loadedImage !== stage.image && <div class="map-loading">DOWNLINKING…</div>}
        <div class="scanlines" />
        <span class="bracket tl" /><span class="bracket tr" /><span class="bracket bl" /><span class="bracket br" />
        <div class="hud tl-text">LAT ??.????<br />LON ???.????</div>
        <div class="hud tr-text">ORBIT {String(stageIndex + 1).padStart(2, '0')}/{String(puzzle.stages.length).padStart(2, '0')}<br />FOV {stage.widthKm.toLocaleString()}KM</div>
        <div class="hud bl-text"><span class="scale" style={{ width: `${bar.pct}%` }} />{bar.km}KM</div>
        {finished && (
          <>
            <div class="marker target" style={{ left: `${answer.x * 100}%`, top: `${answer.y * 100}%` }} />
            <div class="hud br-text gold">{answer.city.toUpperCase()}</div>
          </>
        )}
      </div>

      <div class="scan">
        <span class="dim small">{finished ? 'VIEW' : 'ORBIT'}</span>
        <div class="segments" role={finished ? 'tablist' : undefined} aria-hidden={finished ? undefined : 'true'}>
          {puzzle.stages.map((s, i) => finished ? (
            <button
              key={i}
              type="button"
              role="tab"
              aria-selected={i === stageIndex}
              aria-label={`View ${i + 1}, ${s.widthKm} km across`}
              class={`seg-btn ${i === stageIndex ? 'on' : ''}`}
              onClick={() => setReview(i)}
            />
          ) : <div key={i} class={i <= stageIndex ? 'on' : ''} />)}
        </div>
        <span class="dim small">{finished ? `${stage.widthKm}KM` : `${String(left).padStart(2, '0')} LEFT`}</span>
      </div>

      {!finished && stageIndex >= COUNTRY_HINT_STAGE && (
        <div class="hint">
          // DECRYPTED: COUNTRY <span class="amber">{answer.countryName.toUpperCase()}</span>
          {stageIndex === last && <> · CITY BEGINS WITH <span class="amber">{answer.letter}</span></>}
        </div>
      )}

      {results.length > 0 && !finished && (
        <div class="log">
          <div class="dim small">// GUESS LOG</div>
          {results.map((g) => (
            <div key={g.id} class="log-row">
              <span><span class="gold">&gt;</span> {g.name.toUpperCase()}</span>
              <span class="row gap">
                <span class="dim">{Math.round(g.km).toLocaleString()}KM</span>
                <span class={`dir ${cityCloseness(g)}`}>{g.direction}</span>
                <svg width="16" height="16" viewBox="0 0 16 16" role="img" aria-label={g.direction} style={{ transform: `rotate(${ARROW_ROTATION[g.direction]}deg)` }}>
                  <path d="M8 2 L8 14 M4 6 L8 2 L12 6" fill="none" stroke="currentColor" stroke-width="1.8" class={`dir ${cityCloseness(g)}`} />
                </svg>
              </span>
            </div>
          ))}
        </div>
      )}

      {finished && (
        <div class="terminal">
          <div class="dim">$ share --pass {puzzle.number}</div>
          <div>
            NIGHT LIGHTS #{puzzle.number} <span class="dim">·</span> {day.status === 'won' ? `${day.guesses.length}/${MAX_GUESSES}` : `X/${MAX_GUESSES}`}
          </div>
          <div class="squares" aria-label="Your guesses by closeness">
            {results.map((g) => <span key={g.id} class={`sq ${cityCloseness(g)}`} />)}
          </div>
        </div>
      )}

      {finished && (
        <p class="credit dim small">
          Imagery: <a href="https://earthobservatory.nasa.gov/features/NightLights" target="_blank" rel="noopener">NASA Earth Observatory</a> Black Marble (Suomi NPP VIIRS, 2016), served by <a href="https://www.earthdata.nasa.gov/engage/open-data-services-software/earthdata-developer-portal/gibs-api" target="_blank" rel="noopener">NASA GIBS</a>.
        </p>
      )}

      <div class="push" />

      {finished ? (
        <div class="stack">
          <button type="button" class="exec wide" onClick={share}>{copied ? 'COPIED TO CLIPBOARD' : 'TRANSMIT RESULT'}</button>
          <div class="row between dim small">
            <span>STREAK {String(streak).padStart(3, '0')} · BEST {String(stats.best).padStart(3, '0')}</span>
            <span>NEXT_PASS {untilMidnight(now)}</span>
          </div>
        </div>
      ) : (
        <CityInput cities={cities} exclude={day.guesses} onGuess={guess} />
      )}
    </Shell>
  )
}

function Shell({ children }: { children: preact.ComponentChildren }) {
  return <main class="deck night">{children}</main>
}
