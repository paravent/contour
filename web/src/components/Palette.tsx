import { useEffect, useMemo, useState } from 'preact/hooks'
import { Bit } from './Bit'
import { localDate, untilMidnight } from '../lib/day'
import {
  CLUE_STAGE,
  MAX_GUESSES,
  type Painting,
  type PaintingResult,
  type PalettePuzzle,
  century,
  compare,
  decodePainting,
  loadPaintings,
  matchHint,
  loadPalettePuzzle,
  paintingCloseness,
  paletteDir,
  paletteShareText,
  yearHint,
} from '../lib/palette'
import { type DayState, currentStreak, loadDay, loadStats, recordFinish, saveDay } from '../lib/storage'
import { Briefing, HelpButton } from './Briefing'
import { PaintingInput } from './PaintingInput'
import { StatusBar } from './StatusBar'

const GAME = 'palette'
const CANVAS = 82 // percent of the frame the painting may fill, leaving room for the HUD

function useClock() {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(t)
  }, [])
  return now
}

/** The painting's box inside the square frame, as percentages, keeping its aspect ratio. */
function canvasBox(aspect: number) {
  const w = aspect >= 1 ? CANVAS : CANVAS * aspect
  const h = aspect >= 1 ? CANVAS / aspect : CANVAS
  return { width: `${w}%`, height: `${h}%`, left: `${(100 - w) / 2}%`, top: `${(100 - h) / 2}%` }
}

export function Palette() {
  const date = useMemo(() => localDate(), [])
  const [puzzle, setPuzzle] = useState<PalettePuzzle | null | undefined>(undefined)
  const [paintings, setPaintings] = useState<Painting[]>([])
  const [day, setDay] = useState<DayState>(() => loadDay(GAME, date))
  const [stats, setStats] = useState(() => loadStats(GAME))
  const [copied, setCopied] = useState(false)
  const [help, setHelp] = useState(false)
  const [loadedImage, setLoadedImage] = useState('')
  const now = useClock()

  useEffect(() => {
    loadPalettePuzzle(date).then(setPuzzle).catch(() => setPuzzle(null))
    loadPaintings().then(setPaintings).catch(() => setPaintings([]))
  }, [date])

  const answer = useMemo(() => (puzzle ? decodePainting(puzzle.secret) : null), [puzzle])
  const byId = useMemo(() => new Map(paintings.map((p) => [p.id, p])), [paintings])

  const results: PaintingResult[] = useMemo(() => {
    if (!answer) return []
    return day.guesses.flatMap((id) => {
      const p = byId.get(id)
      return p ? [compare(p, answer)] : []
    })
  }, [day.guesses, answer, byId])

  if (puzzle === undefined) return <Shell><p class="dim boot">&gt; mounting canvas…</p></Shell>
  if (puzzle === null || !answer) {
    return (
      <Shell>
        <StatusBar left="PALETTE://DECK" middle={date} right="NO SIGNAL" tone="lost" />
        <h1 class="title">NO SIGNAL</h1>
        <p class="dim">Today's canvas isn't available yet. Check back shortly.</p>
        <a class="back" href="#/">&lt; BACK TO HUB</a>
      </Shell>
    )
  }

  const finished = day.status !== 'playing'
  const won = day.status === 'won'
  const stageIndex = finished ? puzzle.stages.length - 1 : Math.min(day.guesses.length, puzzle.stages.length - 1)
  const stage = puzzle.stages[stageIndex]
  const dir = paletteDir(puzzle.date)
  const streak = currentStreak(stats, date)
  const left = MAX_GUESSES - day.guesses.length
  const box = canvasBox(puzzle.aspect)

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
    const text = paletteShareText(puzzle.number, results, won)
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

  const clues = [
    { label: 'CENTURY', value: century(answer.year), from: CLUE_STAGE.century },
    { label: 'NATIONALITY', value: answer.nationality.toUpperCase(), from: CLUE_STAGE.nationality },
    { label: 'MOVEMENT', value: answer.movement.toUpperCase(), from: CLUE_STAGE.movement },
    { label: 'INITIALS', value: answer.initials, from: CLUE_STAGE.initials },
    { label: 'ARTIST', value: answer.artist.toUpperCase(), from: CLUE_STAGE.artist },
  ]
  const made = day.guesses.length
  const stripesFirst = puzzle.stages[0].kind === 'stripes'
  // The finished screen fades the full image in over the sharpest grid stage.
  const lastGrid = [...puzzle.stages].reverse().find((s) => s.kind === 'grid') ?? puzzle.stages[0]

  const tone = won ? 'solved' : day.status === 'lost' ? 'lost' : 'live'
  const statusWord = won ? 'SOLVED' : day.status === 'lost' ? 'LOST' : 'LIVE'
  const resolution =
    stage.kind === 'grid' && stage.grid ? `RES ${stage.grid[0]}×${stage.grid[1]}`
      : stage.kind === 'blur' ? 'RES SOFT FOCUS'
        : stage.kind === 'detail' ? 'RES NEAR FOCUS'
          : `PALETTE ${String(puzzle.palette.length).padStart(2, '0')}`

  return (
    <Shell>
      <StatusBar left="PALETTE://DECK" middle={`CANVAS_${String(puzzle.number).padStart(4, '0')}`} right={statusWord} tone={tone} />
      <Briefing
        storageKey="palette:briefed"
        title="PALETTE"
        open={help}
        onClose={() => setHelp(false)}
        start="BEGIN ANALYSIS"
        steps={[
          stripesFirst
            ? <>Each day hides one famous painting, the same for everyone. You start with only its <span class="cyan">five main colours</span>, as stripes as wide as their share of the canvas.</>
            : <>Each day hides one famous painting, the same for everyone. You start with a <span class="cyan">blocky, low-resolution</span> version of it and its five main colours.</>,
          <>Name the <span class="amber">painting</span>: type a title or an artist and pick from the list. You have 6 guesses.</>,
          stripesFirst
            ? <>Each wrong guess sharpens the image: a <span class="magenta">4×4 grid</span> of blocks, then 8×8, 16×16, 32×32, and finally a soft blur.</>
            : <>Each wrong guess sharpens the image: <span class="magenta">finer blocks</span>, then a soft blur, and finally an almost sharp picture.</>,
          <>You know the century and the artist's nationality from the start. Each miss unlocks more: the movement, then the artist's initials, then their <span class="amber">full name</span>. Each miss also says whether the answer was painted <span class="amber">earlier or later</span>, and what it shares with your guess.</>,
          <>Every painting is public domain, from the Art Institute of Chicago or the Met. A new canvas arrives at midnight; keep your streak going.</>,
        ]}
      />

      {!finished && (
        <div class="row between end">
          <a href="#/" class="title glow-cyan" aria-label="Palette, back to hub">PALETTE</a>
          <div class="row gap">
            <div class="readout right">
              <span class="dim small">STREAK</span>
              <span class="big amber">{String(streak).padStart(3, '0')}</span>
            </div>
            <HelpButton onClick={() => setHelp(true)} />
          </div>
        </div>
      )}

      {!finished && <p class="goal">{stage.kind === 'stripes' ? 'Which painting are these colours from?' : 'Which painting is this?'}</p>}

      {finished && (
        <div class="stack tight">
          <div class="dim small">
            {won ? `// MATCH CONFIRMED · ATTEMPT ${String(day.guesses.length).padStart(2, '0')}/${String(MAX_GUESSES).padStart(2, '0')}` : '// SIGNAL LOST · THE PAINTING WAS'}
          </div>
          <h1 class={`answer painting-answer ${won ? 'glow-cyan' : 'glow-magenta'}`}>{answer.title.toUpperCase()}</h1>
          <div class="small">{answer.artist.toUpperCase()} <span class="dim">·</span> <span class="amber">{answer.year}</span></div>
        </div>
      )}

      <div
        class="map canvas"
        role="img"
        aria-label={finished ? `${answer.title} by ${answer.artist}` : `Painting, stage ${stageIndex + 1} of ${puzzle.stages.length}`}
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
              class={`fade-in ${stage.kind === 'blur' || stage.kind === 'detail' ? '' : 'pixelated'}`}
              src={dir + stage.image}
              alt=""
              draggable={false}
              onLoad={() => setLoadedImage(stage.image)}
            />
          )}
        </div>
        {loadedImage !== (finished ? puzzle.reveal : stage.image) && <div class="map-loading">{finished ? 'RESOLVING…' : 'SAMPLING PIGMENT…'}</div>}
        {!finished && <div class="scanlines" />}
        <span class="bracket tl" /><span class="bracket tr" /><span class="bracket bl" /><span class="bracket br" />
        {!finished && <div class="hud tl-text">{resolution}</div>}
        <div class="hud tr-text">{finished ? 'RES FULL' : `STAGE ${String(stageIndex + 1).padStart(2, '0')}/${String(puzzle.stages.length).padStart(2, '0')}`}</div>
        {finished && (
          <div class="hud bl-text credit">
            <a href={answer.source} target="_blank" rel="noopener noreferrer">{answer.credit.toUpperCase()} ↗</a>
          </div>
        )}
      </div>

      <div class="swatches" aria-label="The painting's five main colours">
        {puzzle.palette.map((c) => (
          <div key={c.hex} class="swatch">
            <span class="chip" style={{ background: c.hex }} />
            <span class="small">{c.hex}</span>
            <span class="dim small">{Math.round(c.share * 100)}%</span>
          </div>
        ))}
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
        <div class="clues">
          {clues.map((c) => (
            <div key={c.label} class={`clue ${made >= c.from ? 'open' : ''}`} style={c.label === 'ARTIST' ? { gridColumn: 'span 2' } : undefined}>
              <span class="dim small">{c.label}</span>
              <span>{made >= c.from ? c.value : `LOCKED · ${c.from - made}`}</span>
            </div>
          ))}
        </div>
      )}

      {results.length > 0 && !finished && (
        <div class="log">
          <div class="row between dim small"><span>// GUESS LOG</span><span>TODAY'S PAINTING IS</span></div>
          {results.map((r) => (
            <div key={r.id} class="log-row painting-row">
              <div class="stack tight painting-row-name">
                <span><span class="magenta">&gt;</span> {r.title.toUpperCase()}</span>
                <span class="dim small">{r.artist} · {r.year}</span>
              </div>
              <div class="stack tight right">
                <span class={`dir ${paintingCloseness(r)}`} title="When today's painting was made, relative to this one">{yearHint(r.yearDelta)}</span>
                <span class="small">
                  <span class={r.sameArtist || r.sameMovement || r.sameNationality ? 'amber' : 'dim'}>{matchHint(r)}</span>
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      {finished && (
        <div class="terminal">
          <Bit mood={day.status === 'won' ? 'happy' : 'sad'} blink={false} class="bit-result" />
          <div class="dim">$ share --canvas {puzzle.number}</div>
          <div>
            PALETTE #{puzzle.number} <span class="dim">·</span> {won ? `${day.guesses.length}/${MAX_GUESSES}` : `X/${MAX_GUESSES}`}
          </div>
          <div class="squares" aria-label="Your guesses by closeness">
            {results.map((r) => <span key={r.id} class={`sq ${paintingCloseness(r)}`} />)}
          </div>
          <div class="dim small">Public domain image: {answer.credit}.</div>
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
        <PaintingInput paintings={paintings} exclude={day.guesses} onGuess={guess} />
      )}
    </Shell>
  )
}

function Shell({ children }: { children: preact.ComponentChildren }) {
  return <main class="deck">{children}</main>
}
