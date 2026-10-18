import { useMemo, useState } from 'preact/hooks'
import { type City, searchCities } from '../lib/nightLights'

type Props = { cities: City[]; exclude: string[]; onGuess: (id: string) => void }

/** Night Lights' type-ahead: like CountryInput, over the city pool, with each city's country beside it. */
export function CityInput({ cities, exclude, onGuess }: Props) {
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const matches = useMemo(
    () => searchCities(cities, query).filter((c) => !exclude.includes(c.id)),
    [cities, query, exclude],
  )

  const submit = (c: City | undefined) => {
    if (!c) return
    onGuess(c.id)
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
      <label for="guess" class="dim small">// IDENTIFY CITY</label>
      {matches.length > 0 && (
        <ul class="suggest" role="listbox" id="guess-list">
          {matches.map((c, i) => (
            <li key={c.id} role="option" aria-selected={i === active}>
              <button type="button" class={i === active ? 'active' : ''} onClick={() => submit(c)}>
                {c.name} <span class="dim">· {c.countryName}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <div class="prompt-row">
        <div class="prompt-field">
          <span class="gold" aria-hidden="true">&gt;</span>
          <input
            id="guess"
            type="text"
            autocomplete="off"
            autocapitalize="off"
            spellcheck={false}
            placeholder="type_city"
            role="combobox"
            aria-expanded={matches.length > 0}
            aria-controls="guess-list"
            value={query}
            onInput={(e) => { setQuery((e.target as HTMLInputElement).value); setActive(0) }}
            onKeyDown={onKeyDown}
          />
        </div>
        <button type="submit" class="exec" disabled={matches.length === 0}>EXEC</button>
      </div>
    </form>
  )
}
