import { useMemo, useRef, useState } from 'preact/hooks'
import { BitCaret } from './Bit'
import { type Painting, searchPaintings } from '../lib/palette'

type Props = { paintings: Painting[]; exclude: string[]; onGuess: (id: string) => void }

export function PaintingInput({ paintings, exclude, onGuess }: Props) {
  const [query, setQuery] = useState('')
  const field = useRef<HTMLInputElement>(null)
  const [active, setActive] = useState(0)
  const matches = useMemo(
    () => searchPaintings(paintings, query, 12).filter((p) => !exclude.includes(p.id)).slice(0, 5),
    [paintings, query, exclude],
  )

  const submit = (p: Painting | undefined) => {
    if (!p) return
    onGuess(p.id)
    setQuery('')
    setActive(0)
  }

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActive((i) => Math.min(i + 1, matches.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive((i) => Math.max(i - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      submit(matches[active])
    } else if (e.key === 'Escape') {
      setQuery('')
    }
  }

  return (
    <form class="prompt" onSubmit={(e) => { e.preventDefault(); submit(matches[active]) }}>
      <label for="guess" class="dim small">// IDENTIFY PAINTING · TITLE OR ARTIST</label>
      {matches.length > 0 && (
        <ul class="suggest" role="listbox" id="guess-list">
          {matches.map((p, i) => (
            <li key={p.id} role="option" aria-selected={i === active}>
              <button type="button" class={`painting-option ${i === active ? 'active' : ''}`} onClick={() => submit(p)}>
                <span class="painting-option-title">{p.title}</span>
                <span class="dim small">{p.artist} · {p.year}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <div class="prompt-row">
        <div class="prompt-field">
          <span class="cyan" aria-hidden="true">&gt;</span>
          <input
            ref={field}
            id="guess"
            type="text"
            autocomplete="off"
            autocapitalize="off"
            spellcheck={false}
            placeholder="type_title_or_artist"
            role="combobox"
            aria-expanded={matches.length > 0}
            aria-controls="guess-list"
            value={query}
            onInput={(e) => { setQuery((e.target as HTMLInputElement).value); setActive(0) }}
            onKeyDown={onKeyDown}
          />
          <BitCaret input={field} value={query} misses={exclude.length} />
        </div>
        <button type="submit" class="exec" disabled={matches.length === 0}>EXEC</button>
      </div>
    </form>
  )
}
