import { useMemo, useRef, useState } from 'preact/hooks'
import { BitCaret } from './Bit'
import { MAX_GUESSES } from '../lib/puzzle'
import { type Article, searchArticles } from '../lib/spike'

type Props = { articles: Article[]; exclude: string[]; onGuess: (id: string) => void }

/** Type-ahead over the answer pool: every possible answer is in the list, and nothing else is. */
export function ArticleInput({ articles, exclude, onGuess }: Props) {
  const [query, setQuery] = useState('')
  const field = useRef<HTMLInputElement>(null)
  const [active, setActive] = useState(0)
  const found = useMemo(() => searchArticles(articles, query, 30), [articles, query])
  const matches = useMemo(() => found.filter((a) => !exclude.includes(a.id)).slice(0, 6), [found, exclude])
  const noMatch = query.trim().length >= 2 && matches.length === 0

  const submit = (a: Article | undefined) => {
    if (!a) return
    onGuess(a.id)
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
      <label for="guess" class="dim small">// IDENTIFY ARTICLE · {articles.length} IN INDEX</label>
      {(matches.length > 0 || noMatch) && (
        <ul class="suggest" role="listbox" id="guess-list">
          {matches.map((a, i) => (
            <li key={a.id} role="option" aria-selected={i === active}>
              <button type="button" class={`suggest-article ${i === active ? 'active' : ''}`} onClick={() => submit(a)}>
                <span>{a.name}</span>
                <span class="dim small">{a.category.toUpperCase()}</span>
              </button>
            </li>
          ))}
          {noMatch && <li class="suggest-empty dim small">{found.length ? 'ALREADY GUESSED' : 'NOT IN INDEX · TRY ANOTHER NAME'}</li>}
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
            placeholder="type_article"
            role="combobox"
            aria-expanded={matches.length > 0}
            aria-controls="guess-list"
            value={query}
            onInput={(e) => { setQuery((e.target as HTMLInputElement).value); setActive(0) }}
            onKeyDown={onKeyDown}
          />
          <BitCaret input={field} value={query} misses={exclude.length} max={MAX_GUESSES} found={matches.length > 0} />
        </div>
        <button type="submit" class="exec" disabled={matches.length === 0}>EXEC</button>
      </div>
    </form>
  )
}
