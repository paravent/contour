import { useEffect, useMemo, useState } from 'preact/hooks'
import { Bit } from './Bit'
import { localDate, untilMidnight } from '../lib/day'
import {
  CLUE_STAGE,
  MAX_GUESSES,
  type Brand,
  type BrandResult,
  type LogosPuzzle,
  brandCloseness,
  brandHint,
  compareBrand,
  decade,
  decodeBrand,
  foundedHint,
  loadBrands,
  loadLogosPuzzle,
  logosDir,
  logosShareText,
} from '../lib/logos'
import { type DayState, currentStreak, loadDay, loadStats, recordFinish, saveDay } from '../lib/storage'
import { Briefing, HelpButton } from './Briefing'
import { BrandInput } from './BrandInput'
import { StatusBar } from './StatusBar'

const GAME = 'logos'
const CANVAS = 82 // percent of the frame the logo may fill, leaving room for the HUD

function useClock() {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(t)
  }, [])
  return now
}

/** The logo's box inside the square frame, as percentages, keeping its aspect ratio. */
function canvasBox(aspect: number) {
  const w = aspect >= 1 ? CANVAS : CANVAS * aspect
  const h = aspect >= 1 ? CANVAS / aspect : CANVAS
  return { width: `${w}%`, height: `${h}%`, left: `${(100 - w) / 2}%`, top: `${(100 - h) / 2}%` }
}

export function Logos() {
  const date = useMemo(() => localDate(), [])
  const [puzzle, setPuzzle] = useState<LogosPuzzle | null | undefined>(undefined)
  const [brands, setBrands] = useState<Brand[]>([])
  const [day, setDay] = useState<DayState>(() => loadDay(GAME, date))
  const [stats, setStats] = useState(() => loadStats(GAME))
  const [copied, setCopied] = useState(false)
  const [help, setHelp] = useState(false)
  const [loadedImage, setLoadedImage] = useState('')
  const now = useClock()

  useEffect(() => {
    loadLogosPuzzle(date).then(setPuzzle).catch(() => setPuzzle(null))
    loadBrands().then(setBrands).catch(() => setBrands([]))
  }, [date])

  const answer = useMemo(() => (puzzle ? decodeBrand(puzzle.secret) : null), [puzzle])
  const byId = useMemo(() => new Map(brands.map((b) => [b.id, b])), [brands])

  const results: BrandResult[] = useMemo(() => {
    if (!answer) return []
    return day.guesses.flatMap((id) => {
      const b = byId.get(id)
      return b ? [compareBrand(b, answer)] : []
    })
  }, [day.guesses, answer, byId])

  if (puzzle === undefined) return <Shell><p class="dim boot">&gt; mounting logo feed…</p></Shell>
  if (puzzle === null || !answer) {
    return (
      <Shell>
        <StatusBar left="LOGOS://BRAND" middle={date} right="NO SIGNAL" tone="lost" />
        <h1 class="title">NO SIGNAL</h1>
        <p class="dim">Today's logo isn't available yet. Check back shortly.</p>
        <a class="back" href="#/">&lt; BACK TO HUB</a>
      </Shell>
    )
  }

  const finished = day.status !== 'playing'
  const won = day.status === 'won'
  const stageIndex = finished ? puzzle.stages.length - 1 : Math.min(day.guesses.length, puzzle.stages.length - 1)
  const stage = puzzle.stages[stageIndex]
  const dir = logosDir(puzzle.date)
  const streak = currentStreak(stats, date)
  const left = MAX_GUESSES - day.guesses.length
  const box = { ...canvasBox(puzzle.aspect), background: puzzle.background }

  const update = (next: DayState) => {
    setDay(next)
    saveDay(GAME, date, next)
  }

  const guess = (id: string) => {
    if (finished || day.guesses.includes(id)) return
    const guesses = [...day.guesses, id]
    const hit = id === answer.id
    const status = hit ? 'won' : guesses.length >= MAX_GUESSES ? 'lost' : 'playing'
    update({ ...day, guesses, status })
    if (status !== 'playing') setStats(recordFinish(GAME, stats, date, hit))
  }

  const share = async () => {
    const text = logosShareText(puzzle.number, results, won)
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

  const made = day.guesses.length
  const clues = [
    { label: 'INDUSTRY', value: answer.industry.toUpperCase(), from: CLUE_STAGE.industry },
    { label: 'ORIGIN', value: answer.country.toUpperCase(), from: CLUE_STAGE.country },
    { label: 'FOUNDED', value: decade(answer.founded), from: CLUE_STAGE.founded },
    { label: 'INITIAL', value: answer.letter, from: CLUE_STAGE.letter },
  ]
  // The finished screen fades the clear logo in over the sharpest grid.
  const lastGrid = [...puzzle.stages].reverse().find((s) => s.kind === 'grid') ?? puzzle.stages[0]

  const tone = won ? 'solved' : day.status === 'lost' ? 'lost' : 'live'
  const statusWord = won ? 'SOLVED' : day.status === 'lost' ? 'LOST' : 'LIVE'
  const resolution = stage.kind === 'grid' && stage.grid ? `RES ${stage.grid[0]}×${stage.grid[1]}` : 'RES SOFT FOCUS'

  return (
    <Shell>
      <StatusBar left="LOGOS://BRAND" middle={`LOGO_${String(puzzle.number).padStart(4, '0')}`} right={statusWord} tone={tone} />
      <Briefing
        storageKey="logos:briefed"
        title="LOGOS"
        open={help}
        onClose={() => setHelp(false)}
        start="BEGIN SCAN"
        steps={[
          <>Each day hides one famous brand, the same for everyone. You start with its logo as a <span class="cyan">blocky 8-pixel grid</span>: just the colours and the rough shape.</>,
          <>Name the <span class="amber">brand</span>: type a name and pick from the list. You have 6 guesses.</>,
          <>Each wrong guess sharpens the logo: <span class="magenta">finer blocks</span> (12, 20, 32, then 48 across), and finally a soft blur.</>,
          <>Misses unlock clues: the <span class="amber">industry</span>, then the country it comes from, then the decade it was founded, then the first letter. Each miss also says whether today's brand is the same industry or country as your guess, and whether it was founded earlier or later.</>,
          <>Logos are public-domain files from Wikimedia Commons, and trademarks of their owners. A new logo arrives at midnight; keep your streak going.</>,
        ]}
      />

      {!finished && (
        <div class="row between end">
          <a href="#/" class="title glow-cyan" aria-label="Logos, back to hub">LOGOS</a>
          <div class="row gap">
            <div class="readout right">
              <span class="dim small">STREAK</span>
              <span class="big amber">{String(streak).padStart(3, '0')}</span>
            </div>
            <HelpButton onClick={() => setHelp(true)} />
          </div>
        </div>
      )}

      {!finished && <p class="goal">Which brand's logo is this?</p>}

      {finished && (
        <div class="stack tight">
          <div class="dim small">
            {won ? `// MATCH CONFIRMED · ATTEMPT ${String(day.guesses.length).padStart(2, '0')}/${String(MAX_GUESSES).padStart(2, '0')}` : '// SIGNAL LOST · THE BRAND WAS'}
          </div>
          <h1 class={`answer ${won ? 'glow-cyan' : 'glow-magenta'}`}>{answer.name.toUpperCase()}</h1>
          <div class="small">
            {answer.industry.toUpperCase()} <span class="dim">·</span> {answer.country.toUpperCase()} <span class="dim">·</span> <span class="amber">SINCE {answer.founded}</span>
          </div>
        </div>
      )}

      <div
        class="map canvas"
        role="img"
        aria-label={finished ? `The ${answer.name} logo` : `Logo, stage ${stageIndex + 1} of ${puzzle.stages.length}`}
      >
        <div class="canvas-box" style={box}>
          {finished ? (
            <>
              <img class="pixelated" src={dir + lastGrid.image} alt="" draggable={false} />
              <img key="reveal" class="reveal" src={dir + puzzle.reveal} alt="" draggable={false} onLoad={() => setLoadedImage(puzzle.reveal)} />
            </>
          ) : (
            <img
              key={stage.image}
              class={`fade-in ${stage.kind === 'blur' ? '' : 'pixelated'}`}
              src={dir + stage.image}
              alt=""
              draggable={false}
              onLoad={() => setLoadedImage(stage.image)}
            />
          )}
        </div>
        {loadedImage !== (finished ? puzzle.reveal : stage.image) && <div class="map-loading">{finished ? 'RESOLVING…' : 'SAMPLING PIXELS…'}</div>}
        {!finished && <div class="scanlines" />}
        <span class="bracket tl" /><span class="bracket tr" /><span class="bracket bl" /><span class="bracket br" />
        {!finished && <div class="hud tl-text">{resolution}</div>}
        <div class="hud tr-text">{finished ? 'RES FULL' : `STAGE ${String(stageIndex + 1).padStart(2, '0')}/${String(puzzle.stages.length).padStart(2, '0')}`}</div>
        {finished && (
          <div class="hud bl-text credit">
            <a href={answer.source} target="_blank" rel="noopener noreferrer">WIKIMEDIA COMMONS ↗</a>
          </div>
        )}
      </div>

      {!finished && (
        <div class="scan">
          <span class="dim small">FOCUS</span>
          <div class="segments" aria-hidden="true">
            {puzzle.stages.map((_, i) => <div key={i} class={i <= stageIndex ? 'on' : ''} />)}
          </div>
          <span class="dim small">{String(left).padStart(2, '0')} LEFT</span>
        </div>
      )}

      {!finished && (
        <div class="clues clues-four">
          {clues.map((c) => (
            <div key={c.label} class={`clue ${made >= c.from ? 'open' : ''}`}>
              <span class="dim small">{c.label}</span>
              <span>{made >= c.from ? c.value : `LOCKED · ${c.from - made}`}</span>
            </div>
          ))}
        </div>
      )}

      {results.length > 0 && !finished && (
        <div class="log">
          <div class="row between dim small"><span>// GUESS LOG</span><span>TODAY'S BRAND IS</span></div>
          {results.map((r) => (
            <div key={r.id} class="log-row painting-row">
              <div class="stack tight painting-row-name">
                <span><span class="magenta">&gt;</span> {r.name.toUpperCase()}</span>
                <span class="dim small">{r.industry} · {r.country} · {r.founded}</span>
              </div>
              <div class="stack tight right">
                <span class={`dir ${brandCloseness(r)}`}>{brandHint(r)}</span>
                <span class="small dim" title="When today's brand was founded, relative to this one">{foundedHint(r.foundedDelta)}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {finished && (
        <div class="terminal">
          <Bit mood={day.status === 'won' ? 'happy' : 'sad'} blink={false} class="bit-result" />
          <div class="dim">$ share --logo {puzzle.number}</div>
          <div>
            LOGOS #{puzzle.number} <span class="dim">·</span> {won ? `${day.guesses.length}/${MAX_GUESSES}` : `X/${MAX_GUESSES}`}
          </div>
          <div class="squares" aria-label="Your guesses by closeness">
            {results.map((r) => <span key={r.id} class={`sq ${brandCloseness(r)}`} />)}
          </div>
          <div class="dim small">Logo: {answer.licence.toLowerCase() === 'public domain' ? 'public domain' : answer.licence}, via Wikimedia Commons. Trademark of its owner.</div>
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
        <BrandInput brands={brands} exclude={day.guesses} onGuess={guess} />
      )}
    </Shell>
  )
}

function Shell({ children }: { children: preact.ComponentChildren }) {
  return <main class="deck">{children}</main>
}
