import { useMemo, useRef, useState } from 'preact/hooks'
import { BitCaret } from './Bit'
import { type Brand, MAX_GUESSES, searchBrands } from '../lib/logos'

type Props = { brands: Brand[]; exclude: string[]; onGuess: (id: string) => void }

export function BrandInput({ brands, exclude, onGuess }: Props) {
  const [query, setQuery] = useState('')
  const field = useRef<HTMLInputElement>(null)
  const [active, setActive] = useState(0)
  const matches = useMemo(
    () => searchBrands(brands, query, 12).filter((b) => !exclude.includes(b.id)).slice(0, 5),
    [brands, query, exclude],
  )

  const submit = (b: Brand | undefined) => {
    if (!b) return
    onGuess(b.id)
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
      <label for="guess" class="dim small">// IDENTIFY BRAND</label>
      {matches.length > 0 && (
        <ul class="suggest" role="listbox" id="guess-list">
          {matches.map((b, i) => (
            <li key={b.id} role="option" aria-selected={i === active}>
              <button type="button" class={i === active ? 'active' : ''} onClick={() => submit(b)}>{b.name}</button>
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
            placeholder="type_a_brand"
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
