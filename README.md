# Contour

A daily geography puzzle. You see an unlabelled contour map of somewhere on Earth and have six guesses to name the country. Contour lines are coloured by height on one scale for the whole day (teal lowlands up through green and gold to pale peaks), with a colour bar on the map. The first view is 40 km across with the coastline drawn; each wrong guess zooms out and reveals more: the sea, then borders and the continent, then the first letter. Get it right and you get a GeoGuessr-style bonus: drop a pin on the exact spot for up to 5,000 points.

Every map is drawn from real elevation data, and the site makes each day's puzzle on its own with no manual work.

## How it works

```
generator/   Python: picks the day's place, fetches elevation, draws six SVG stages
web/         Preact + Vite: the hub and the game (cyberpunk terminal style)
.github/     the daily build-and-deploy job, and CI for pull requests
```

- **Data.** Elevation comes from the free [AWS Terrain Tiles](https://registry.opendata.aws/terrain-tiles/) (Terrarium PNGs, which include sea-floor depth, so anything at or below 0 m is sea). Country names, label points and borders come from [Natural Earth](https://www.naturalearthdata.com/) (public domain).
- **Places.** `generator/places.csv` is the answer pool: notable terrain with its country (Natural Earth `ADM0_A3` code). Add rows to grow it.
- **Schedule.** Puzzle *n* is the *n*th place in a fixed shuffle of the pool, set by a secret seed. If a place fails the quality checks (too much sea or too flat in the first view, or an SVG too large), the day goes to the next place. Because the checks are deterministic, every run agrees on the answer.
- **Daily job.** `.github/workflows/daily.yml` runs just after midnight UTC, at noon UTC, and on every push to `main`. It generates yesterday through a week ahead, which checks that the coming week is playable. It then publishes only yesterday, today and tomorrow (so every timezone has its puzzle) and deploys to GitHub Pages.
- **Game.** The puzzle changes at the player's local midnight. Progress, stats and streaks live in the browser's local storage, so there are no accounts.

## Spike

The second daily game. You see a year of daily pageviews for one English Wikipedia article, drawn as a neon trace, and have six guesses to name it. The article's category (actor, musician, place…) is shown from the start. Each wrong guess unlocks another clue: the y-axis scale, the dates of the spikes, the article's short description, the shape of its name, then its first letter. Guesses come from a type-ahead over the answer pool, and a wrong guess in the right category lights up amber.

- **Data.** Daily views come from the [Wikimedia pageviews API](https://doc.wikimedia.org/generated-data-platform/aqs/analytics-api/) (human readers only) and the description and intro from the Wikipedia Action API. Each chart ends 10 days before its puzzle date, so the daily job's week ahead only uses days that are already published and every run picks the same article.
- **Pool.** `generator/spike_pool.csv` holds a few hundred well-known articles (exact Wikipedia title, display name, category, aliases). After editing it, refresh the game's search list with `python generator/generate_spike.py --export-pool web/public/data/spike-articles.json`, and audit it against live data with `python generator/generate_spike.py --check-pool`.
- **Schedule.** Like Contour: a seeded shuffle of the pool, and an article whose chart has missing days, too few readers or no clear spike hands its day to the next one.

```sh
python generator/generate_spike.py --out web/public/puzzles/spike   # yesterday, today, tomorrow (UTC)
```

## Logos

The third game, at `#/logos`: name the brand from its pixelated logo. Stage 1 is the logo as an 8-cell-wide pixel grid, so you get its colours and rough shape; each wrong guess sharpens it (12, 20, 32 and 48 cells, then a soft blur) and the result screen shows it clear. Misses unlock clues in order: the industry, the country the brand comes from, the decade it was founded, then its first letter. Every miss also says whether today's brand shares your guess's industry or country, and whether it was founded earlier or later. Guesses come from a type-ahead over every brand in the pool (names and aliases).

- **Pool.** `generator/brands.csv` lists a few hundred famous brands with their English Wikipedia title, Wikidata item, industry, country of origin, founding year and search aliases. `file` names the brand's logo on Wikimedia Commons; a brand with no file, or marked `wordmark` (its logo spells out the name, which would give the answer away once sharp), can be guessed but is never an answer. `python generator/generate_logos.py --check-pool` looks every brand up on Wikidata (logo property P154, founding year, country) and checks each chosen file's licence and image; after editing the CSV, rebuild the game's list with `--guess-list web/public/data/brands.json`.
- **Licences.** Only files Commons marks as public domain (usually `PD-textlogo`: too simple to be copyrighted) or CC0 are used; anything else hands the day to the next brand. Logos remain trademarks of their owners. The result screen credits Wikimedia Commons and links to the file's page.
- **Generator.** `generator/generate_logos.py` asks Commons for the day's file (licence, and a PNG rendering 960 px wide), flattens it onto white (or near-black for a white logo), trims and frames it, and writes six small PNG stages, a clear `full.png` and `puzzle.json` to `web/public/puzzles/logos/<date>/`. Scheduling works like the other games: a seeded shuffle of the answerable brands; a file that is missing, not public domain or unusable hands the day to the next brand, and a network failure fails the run, so every run agrees on the answer. Its public annotations never name a brand.

Palette (paintings) has been retired from the hub in favour of Logos. Its code (`generator/generate_palette.py`, `generator/palette_gen/`, `web/src/components/Palette.tsx`) is still in the repository and tested, so it can be put back by restoring its hub card, route and workflow steps.

## Night Lights

The fourth game, at `#/night-lights`: find the city from satellite imagery of the Earth at night. The first view is a 50 km close-up of the city's glow; each wrong guess pulls back (110, 240, 500, 1,000, then 2,000 km across) to show neighbouring towns, highways, dark coastlines and other cities, and the last two views add the country, then the city's first letter. Guesses are typed from the city pool, and each wrong one shows how far and in which direction the target lies.

- **Data.** NASA's [Black Marble](https://earthobservatory.nasa.gov/features/NightLights) night-lights composite (Suomi NPP VIIRS, 2016), layer `VIIRS_Black_Marble` from the [GIBS](https://nasa-gibs.github.io/gibs-api-docs/) WMTS service in Web Mercator (`GoogleMapsCompatible_Level8`, zoom 0 to 8, tile paths `{z}/{row}/{col}`). The generator recolours it as gold light on black.
- **Cities.** `generator/cities.csv` is both the answer pool and the guessable list: about 230 major cities with their country (Natural Earth `ADM0_A3`). After editing it, refresh the web copy with `python generator/generate_night_lights.py --export-cities web/public/data/cities.json` (a test checks they match).
- **Schedule.** Same seed and launch date as Contour, with its own shuffle. If the first view is too dark (too little of it lit, or the city itself unlit), the day goes to another city further down the shuffle.
- **Generating.** `python generator/generate_night_lights.py --out web/public/puzzles/night-lights` (yesterday, today and tomorrow UTC; `--start` and `--days` as for Contour). Set `NIGHT_LIGHTS_DEBUG=1` to print per-stage brightness stats and an ASCII preview as GitHub annotations.

## One-time setup

1. **Settings → Pages → Build and deployment → Source: GitHub Actions.**
2. **Settings → Secrets and variables → Actions → New repository secret** named `CONTOUR_SEED`, set to any long random string. Without it, the schedule uses the public dev seed in `generator/config.json`, and anyone could work out future answers.
3. Run **Actions → Daily puzzles → Run workflow** once, or push to `main`.

`generator/config.json` holds the launch date, which is puzzle #1.

## Local development

```sh
pip install -r generator/requirements.txt
python generator/generate.py --out web/public/puzzles/contour   # yesterday, today, tomorrow (UTC)
python generator/generate_logos.py --out web/public/puzzles/logos

cd web
npm install
npm run dev
```

Tests: `python -m pytest generator/tests` and `cd web && npm test`. The Night Lights tests use synthetic tiles, so they run offline.

The countries list the game uses (`web/public/data/countries.json`) is generated from Natural Earth:

```sh
python generator/contour_gen/countries.py --out web/public/data/countries.json
```
