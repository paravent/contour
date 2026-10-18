import { useEffect, useMemo, useState } from 'preact/hooks'
import { localDate, untilMidnight } from '../lib/day'
import { bearingDeg, compass, haversineKm } from '../lib/geo'
import {
  type Country,
  MAX_GUESSES,
  type Puzzle,
  contourClues,
  decodeAnswer,
  loadCountries,
  loadPuzzle,
  puzzleDir,
} from '../lib/puzzle'
import { type GuessResult, closeness, shareText } from '../lib/share'
import { type DayState, type Pin, currentStreak, loadDay, loadStats, recordFinish, saveDay } from '../lib/storage'
import { Briefing, HelpButton } from './Briefing'
import { CountryInput } from './CountryInput'
import { PinMap } from './PinMap'
import { StatusBar } from './StatusBar'

const GAME = 'contour'

const ARROW_ROTATION: Record<string, number> = { N: 0, NE: 45, E: 90, SE: 135, S: 180, SW: 225, W: 270, NW: 315 }

function scaleBar(widthKm: number) {
  const nice = [1, 2, 5, 10, 20, 50, 100, 200, 500]
  const km = nice.filter((n) => n <= widthKm / 4).pop() ?? 1
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

export function Contour() {
  const date = useMemo(() => localDate(), [])
  const [puzzle, setPuzzle] = useState<Puzzle | null | undefined>(undefined)
  const [countries, setCountries] = useState<Country[]>([])
  const [day, setDay] = useState<DayState>(() => loadDay(GAME, date))
  const [stats, setStats] = useState(() => loadStats(GAME))
  const [copied, setCopied] = useState(false)
  const [help, setHelp] = useState(false)
  const [loadedImage, setLoadedImage] = useState('')
  const now = useClock()

  useEffect(() => {
    loadPuzzle(date).then(setPuzzle).catch(() => setPuzzle(null))
    loadCountries().then(setCountries).catch(() => setCountries([]))
  }, [date])

  const answer = useMemo(() => (puzzle ? decodeAnswer(puzzle.secret) : null), [puzzle])
  const byCode = useMemo(() => new Map(countries.map((c) => [c.code, c])), [countries])

  const results: GuessResult[] = useMemo(() => {
    if (!answer) return []
    return day.guesses.flatMap((code) => {
      const c = byCode.get(code)
      if (!c) return []
      const correct = code === answer.country
      return [{
        code,
        name: c.name,
        correct,
        km: correct ? 0 : haversineKm(c.lat, c.lon, answer.lat, answer.lon),
        direction: compass(bearingDeg(c.lat, c.lon, answer.lat, answer.lon)),
      }]
    })
  }, [day.guesses, answer, byCode])

  if (puzzle === undefined) return <Shell><p class="dim boot">&gt; establishing uplink…</p></Shell>
  if (puzzle === null || !answer) {
    return (
      <Shell>
        <StatusBar left="CONTOUR://DECK" middle={date} right="NO SIGNAL" tone="lost" />
        <h1 class="title">NO SIGNAL</h1>
        <p class="dim">Today's sheet isn't available yet. Check back shortly.</p>
        <a class="back" href="#/">&lt; BACK TO HUB</a>
      </Shell>
    )
  }

  const finished = day.status !== 'playing'
  const stageIndex = finished ? puzzle.stages.length - 1 : Math.min(day.guesses.length, puzzle.stages.length - 1)
  const stage = puzzle.stages[stageIndex]
  const dir = puzzleDir(puzzle.date)
  const bar = scaleBar(stage.widthKm)
  const streak = currentStreak(stats, date)
  const left = MAX_GUESSES - day.guesses.length

  const update = (next: DayState) => {
    setDay(next)
    saveDay(GAME, date, next)
  }

  const guess = (code: string) => {
    if (finished || day.guesses.includes(code)) return
    const guesses = [...day.guesses, code]
    const won = code === answer.country
    const status = won ? 'won' : guesses.length >= MAX_GUESSES ? 'lost' : 'playing'
    update({ ...day, guesses, status })
    if (status !== 'playing') setStats(recordFinish(GAME, stats, date, won))
  }

  const lockPin = (pin: Pin) => update({ ...day, pin })

  const share = async () => {
    const text = shareText(puzzle.number, results, day.status === 'won', day.pin?.score)
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
      <StatusBar left="CONTOUR://DECK" middle={`SHEET_${String(puzzle.number).padStart(4, '0')}`} right={statusWord} tone={tone} />
      <Briefing
        storageKey="contour:briefed"
        title="CONTOUR"
        open={help}
        onClose={() => setHelp(false)}
        start="BEGIN SCAN"
        steps={[
          <>Each day the map shows one real place on Earth, the same for everyone. You only see its terrain, drawn as <span class="cyan">contour lines</span>: each line joins ground of equal height, so tight lines mean steep slopes and rings mean peaks.</>,
          <>Name the <span class="amber">country</span> it's in. You have 6 guesses.</>,
          <>Each wrong guess zooms the map out and adds a clue: the <span class="magenta">sea</span>, then <span class="amber">borders</span>, then the <span class="cyan">continent</span>, and finally the country's first letter.</>,
          <>Each wrong guess also shows how far the target is from that country and in which direction.</>,
          <>Get it right and you unlock the bonus: drop a pin on the exact spot for up to 5,000 points.</>,
          <>A new map arrives at midnight. Share your result, and keep your streak going.</>,
        ]}
      />

      {!finished && (
        <div class="row between end">
          <a href="#/" class="title glow-cyan" aria-label="Contour, back to hub">CONTOUR</a>
          <div class="row gap">
            <div class="readout right">
              <span class="dim small">STREAK</span>
              <span class="big amber">{String(streak).padStart(3, '0')}</span>
            </div>
            <HelpButton onClick={() => setHelp(true)} />
          </div>
        </div>
      )}

      {!finished && <p class="goal">Which country is this terrain in?</p>}

      {finished && (
        <div class="stack tight">
          <div class="dim small">
            {day.status === 'won' ? `// TARGET ACQUIRED · ATTEMPT ${String(day.guesses.length).padStart(2, '0')}/${String(MAX_GUESSES).padStart(2, '0')}` : '// SIGNAL LOST · THE TARGET WAS'}
          </div>
          <h1 class={`answer ${day.status === 'won' ? 'glow-cyan' : 'glow-magenta'}`}>{answer.countryName.toUpperCase()}</h1>
        </div>
      )}

      {finished && day.status === 'won' ? (
        <PinMap
          image={dir + puzzle.pinMap.image}
          bounds={puzzle.pinMap.bounds}
          widthKm={puzzle.stages[puzzle.stages.length - 1].widthKm}
          answer={answer}
          pin={day.pin}
          onLock={lockPin}
        />
      ) : (
        <div class="map" role="img" aria-label={`Unlabelled contour map, stage ${stageIndex + 1} of ${puzzle.stages.length}`}>
          <img
            key={stage.image}
            class="fade-in"
            src={dir + stage.image}
            alt=""
            draggable={false}
            onLoad={() => setLoadedImage(stage.image)}
          />
          {loadedImage !== stage.image && <div class="map-loading">SCANNING TERRAIN…</div>}
          <div class="scanlines" />
          <div class="grid" />
          <span class="bracket tl" /><span class="bracket tr" /><span class="bracket bl" /><span class="bracket br" />
          <div class="hud tl-text">LAT ??.????<br />LON ???.????</div>
          <div class="hud tr-text">ZOOM {String(stageIndex + 1).padStart(2, '0')}/{String(puzzle.stages.length).padStart(2, '0')}{stage.intervalM ? <><br />INTERVAL {stage.intervalM}M</> : null}</div>
          <div class="hud bl-text"><span class="scale" style={{ width: `${bar.pct}%` }} />{bar.km}KM</div>
          {finished && <div class="hud br-text magenta">{answer.place.toUpperCase()}</div>}
        </div>
      )}

      {!finished && (
        <div class="scan">
          <span class="dim small">SCAN</span>
          <div class="segments" aria-hidden="true">
            {puzzle.stages.map((_, i) => <div key={i} class={i <= stageIndex ? 'on' : ''} />)}
          </div>
          <span class="dim small">{String(left).padStart(2, '0')} LEFT</span>
        </div>
      )}

      {!finished && contourClues(answer, day.guesses.length).map((c) => (
        <div key={c.label} class="hint">// DECRYPTED: {c.label} <span class="amber">{c.value}</span></div>
      ))}

      {results.length > 0 && !finished && (
        <div class="log">
          <div class="dim small">// GUESS LOG</div>
          {results.map((g) => (
            <div key={g.code} class="log-row">
              <span><span class="magenta">&gt;</span> {g.name.toUpperCase()}</span>
              <span class="row gap">
                <span class="dim">{Math.round(g.km).toLocaleString()}KM</span>
                <span class={`dir ${closeness(g)}`}>{g.direction}</span>
                <svg width="16" height="16" viewBox="0 0 16 16" role="img" aria-label={g.direction} style={{ transform: `rotate(${ARROW_ROTATION[g.direction]}deg)` }}>
                  <path d="M8 2 L8 14 M4 6 L8 2 L12 6" fill="none" stroke="currentColor" stroke-width="1.8" class={`dir ${closeness(g)}`} />
                </svg>
              </span>
            </div>
          ))}
        </div>
      )}

      {finished && (
        <div class="terminal">
          <div class="dim">$ share --sheet {puzzle.number}</div>
          <div>
            CONTOUR #{puzzle.number} <span class="dim">·</span> {day.status === 'won' ? `${day.guesses.length}/${MAX_GUESSES}` : `X/${MAX_GUESSES}`}
            {day.pin && <> <span class="dim">·</span> <span class="amber">{day.pin.score}</span></>}
          </div>
          <div class="squares" aria-label="Your guesses by closeness">
            {results.map((g) => <span key={g.code} class={`sq ${closeness(g)}`} />)}
          </div>
        </div>
      )}

      <div class="push" />

      {finished ? (
        <div class="stack">
          <button type="button" class="exec wide" onClick={share}>{copied ? 'COPIED TO CLIPBOARD' : 'TRANSMIT RESULT'}</button>
          <div class="row between dim small">
            <span>STREAK {String(streak).padStart(3, '0')} · BEST {String(stats.best).padStart(3, '0')}</span>
            <span>NEXT_DROP {untilMidnight(now)}</span>
          </div>
        </div>
      ) : (
        <CountryInput countries={countries} exclude={day.guesses} onGuess={guess} />
      )}
    </Shell>
  )
}

function Shell({ children }: { children: preact.ComponentChildren }) {
  return <main class="deck">{children}</main>
}
