import { useEffect, useMemo, useState } from 'preact/hooks'
import { addDays, localDate, untilMidnight } from '../lib/day'
import { MAX_GUESSES } from '../lib/puzzle'
import {
  type Article,
  SPIKE_CLUES,
  STAGES,
  type SpikePuzzle,
  type Verdict,
  compact,
  decodeSpikeAnswer,
  loadArticles,
  loadSpikePuzzle,
  nameWords,
  nextSpikeClue,
  shortDate,
  spikeShareText,
  verdict,
} from '../lib/spike'
import { type DayState, currentStreak, loadDay, loadStats, recordFinish, saveDay } from '../lib/storage'
import { ArticleInput } from './ArticleInput'
import { Briefing, HelpButton } from './Briefing'
import { SpikeChart } from './SpikeChart'
import { StatusBar } from './StatusBar'
import './spike.css'

const GAME = 'spike'

function useClock() {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(t)
  }, [])
  return now
}

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b)
  const m = s.length >> 1
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}

export function Spike() {
  const date = useMemo(() => localDate(), [])
  const [puzzle, setPuzzle] = useState<SpikePuzzle | null | undefined>(undefined)
  const [articles, setArticles] = useState<Article[]>([])
  const [day, setDay] = useState<DayState>(() => loadDay(GAME, date))
  const [stats, setStats] = useState(() => loadStats(GAME))
  const [copied, setCopied] = useState(false)
  const [help, setHelp] = useState(false)
  const now = useClock()

  useEffect(() => {
    loadSpikePuzzle(date).then(setPuzzle).catch(() => setPuzzle(null))
    loadArticles().then(setArticles).catch(() => setArticles([]))
  }, [date])

  const answer = useMemo(() => (puzzle ? decodeSpikeAnswer(puzzle.secret) : null), [puzzle])
  const byId = useMemo(() => new Map(articles.map((a) => [a.id, a])), [articles])
  const log = useMemo(() => {
    if (!answer) return []
    return day.guesses.flatMap((id) => {
      const a = byId.get(id)
      return a ? [{ article: a, verdict: verdict(a, answer) }] : []
    })
  }, [day.guesses, answer, byId])

  if (puzzle === undefined) return <Shell><p class="dim boot">&gt; tapping the feed…</p></Shell>
  if (puzzle === null || !answer) {
    return (
      <Shell>
        <StatusBar left="SPIKE://FEED" middle={date} right="NO SIGNAL" tone="lost" />
        <h1 class="title">NO SIGNAL</h1>
        <p class="dim">Today's trace isn't available yet. Check back shortly.</p>
        <a class="back" href="#/">&lt; BACK TO HUB</a>
      </Shell>
    )
  }

  const finished = day.status !== 'playing'
  const stage = finished ? STAGES - 1 : Math.min(day.guesses.length, STAGES - 1)
  const streak = currentStreak(stats, date)
  const left = MAX_GUESSES - day.guesses.length
  const verdicts: Verdict[] = log.map((g) => g.verdict)
  const words = nameWords(answer.name)
  const shape = words.map((w) => w.length)
  const peak = Math.max(...puzzle.views)

  const update = (next: DayState) => {
    setDay(next)
    saveDay(GAME, date, next)
  }

  const guess = (id: string) => {
    if (finished || day.guesses.includes(id)) return
    const guesses = [...day.guesses, id]
    const won = id === answer.id
    const status = won ? 'won' : guesses.length >= MAX_GUESSES ? 'lost' : 'playing'
    update({ ...day, guesses, status })
    if (status !== 'playing') setStats(recordFinish(GAME, stats, date, won))
  }

  const share = async () => {
    const text = spikeShareText(puzzle.number, verdicts, day.status === 'won')
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
      <StatusBar left="SPIKE://FEED" middle={`TRACE_${String(puzzle.number).padStart(4, '0')}`} right={statusWord} tone={tone} />
      <Briefing
        storageKey="spike:briefed"
        title="SPIKE"
        open={help}
        onClose={() => setHelp(false)}
        start="TAP THE FEED"
        steps={[
          <>The chart shows how many people read one <span class="cyan">English Wikipedia article</span> each day over a year. It's the same article for everyone.</>,
          <>Name the article. Big <span class="magenta">spikes</span> are your best clue: a holiday, a match, a release, a birthday, an award night.</>,
          <>Start typing and pick from the list. Every answer is a well-known article in the index. You have 6 guesses, and a guess in the right <span class="amber">category</span> lights up amber.</>,
          <>You always see the article's <span class="amber">category</span> (an actor, a place, a holiday…). Each wrong guess unlocks another clue: the views scale, the spike dates, its short description, the shape of its name, and its first letter.</>,
          <>A new trace arrives at midnight. Share your result, and keep your streak going.</>,
        ]}
      />

      {!finished && (
        <div class="row between end">
          <a href="#/" class="title glow-cyan" aria-label="Spike, back to hub">SPIKE</a>
          <div class="row gap">
            <div class="readout right">
              <span class="dim small">STREAK</span>
              <span class="big amber">{String(streak).padStart(3, '0')}</span>
            </div>
            <HelpButton onClick={() => setHelp(true)} />
          </div>
        </div>
      )}

      {!finished && <p class="goal">Which Wikipedia article had this year?</p>}

      {finished && (
        <div class="stack tight">
          <div class="dim small">
            {day.status === 'won' ? `// TARGET ACQUIRED · ATTEMPT ${String(day.guesses.length).padStart(2, '0')}/${String(MAX_GUESSES).padStart(2, '0')}` : '// SIGNAL LOST · THE ARTICLE WAS'}
          </div>
          <h1 class={`answer ${day.status === 'won' ? 'glow-cyan' : 'glow-magenta'}`}>{answer.name.toUpperCase()}</h1>
        </div>
      )}

      <div class="monitor">
        <div class="category-tag" aria-label={`Category: ${answer.category}`}>
          <span class="dim">CATEGORY:</span> {answer.category.toUpperCase()}
        </div>
        <SpikeChart views={puzzle.views} start={puzzle.start} spikes={puzzle.spikes} showScale={stage >= SPIKE_CLUES.scale} showDates={stage >= SPIKE_CLUES.dates}
          channel={`CH ${String(stage + 1).padStart(2, '0')}/${String(STAGES).padStart(2, '0')}`} />
        <div class="scanlines" />
        <span class="bracket tl" /><span class="bracket tr" /><span class="bracket bl" /><span class="bracket br" />
      </div>

      {!finished && (
        <div class="scan">
          <span class="dim small">INTEL</span>
          <div class="segments" aria-hidden="true">
            {Array.from({ length: STAGES }, (_, i) => <div key={i} class={i <= stage ? 'on' : ''} />)}
          </div>
          <span class="dim small">{String(left).padStart(2, '0')} LEFT</span>
        </div>
      )}

      <div class="intel">
        {stage >= SPIKE_CLUES.scale && (
          <div class="intel-row">
            <span class="dim">SCALE</span>
            <span>PEAK <span class="cyan">{compact(peak)}</span>/DAY · TYPICAL <span class="cyan">{compact(median(puzzle.views))}</span>/DAY</span>
          </div>
        )}
        {stage >= SPIKE_CLUES.dates && (
          <div class="intel-row">
            <span class="dim">SPIKES</span>
            <span class="stack tight">
              {puzzle.spikes.map((s, k) => (
                <span key={s}><span class="magenta">{k + 1}</span> {shortDate(addDays(puzzle.start, s))} <span class="dim">·</span> {compact(puzzle.views[s])}</span>
              ))}
            </span>
          </div>
        )}
        {stage >= SPIKE_CLUES.description && (
          <div class="intel-row">
            <span class="dim">ABOUT</span>
            {answer.description
              ? <span>“{answer.description}”</span>
              : <span class="dim">NO DESCRIPTION ON FILE · {words.length} {words.length === 1 ? 'WORD' : 'WORDS'} IN THE NAME</span>}
          </div>
        )}
        {stage >= SPIKE_CLUES.shape && (
          <div class="intel-row">
            <span class="dim">SHAPE</span>
            <span class="stack tight">
              <span class="cells" aria-label={`${shape.length} words: ${shape.join(', ')} letters`}>
                {shape.map((n, w) => (
                  <span key={w} class="word">
                    {Array.from({ length: n }, (_, c) => (
                      <span key={c} class="cell">{finished || (w === 0 && c === 0 && stage >= SPIKE_CLUES.letter) ? words[w][c].toUpperCase() : ''}</span>
                    ))}
                  </span>
                ))}
              </span>
              <span class="dim small">{shape.length} {shape.length === 1 ? 'WORD' : 'WORDS'} · {shape.join('+')} LETTERS</span>
            </span>
          </div>
        )}
        {!finished && nextSpikeClue(stage) && (
          <div class="intel-row locked">
            <span class="dim">NEXT</span>
            <span class="dim">▒▒ {nextSpikeClue(stage)} UNLOCKS ON A MISS</span>
          </div>
        )}
      </div>

      {log.length > 0 && !finished && (
        <div class="log">
          <div class="dim small">// GUESS LOG</div>
          {log.map((g) => (
            <div key={g.article.id} class="log-row">
              <span><span class="magenta">&gt;</span> {g.article.name.toUpperCase()}</span>
              <span class={`verdict ${g.verdict}`}>{g.article.category.toUpperCase()}{g.verdict === 'near' ? ' ✓' : ' ✕'}</span>
            </div>
          ))}
        </div>
      )}

      {finished && (
        <div class="dossier">
          {answer.extract && <p>{answer.extract}</p>}
          <a href={answer.url} target="_blank" rel="noopener" class="cyan small">&gt; OPEN ARTICLE ON WIKIPEDIA ↗</a>
        </div>
      )}

      {finished && (
        <div class="terminal">
          <div class="dim">$ share --trace {puzzle.number}</div>
          <div>SPIKE #{puzzle.number} <span class="dim">·</span> {day.status === 'won' ? `${day.guesses.length}/${MAX_GUESSES}` : `X/${MAX_GUESSES}`}</div>
          <div class="squares" aria-label="Your guesses: right category or not">
            {verdicts.map((v, i) => <span key={i} class={`sq ${v === 'miss' ? 'far' : v}`} />)}
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
        <ArticleInput articles={articles} exclude={day.guesses} onGuess={guess} />
      )}
    </Shell>
  )
}

function Shell({ children }: { children: preact.ComponentChildren }) {
  return <main class="deck">{children}</main>
}
