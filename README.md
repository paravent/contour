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

## Palette

The second live game: name a famous painting. Answers come from the pool rows marked `famous` (the instantly recognisable ones); every painting in the pool can be guessed. Stage 1 is a 12-cell-wide pixel grid of the painting, shown with its five dominant colours. Each wrong guess sharpens it: 20, 32 and 48-cell grids, a soft blur, then a nearly sharp picture. The century and the artist's nationality show from the start; misses unlock the movement, the artist's initials, then their full name. Every miss says whether the answer was painted earlier or later and what it shares with your guess (artist, movement, nationality). Guesses come from a type-ahead over the whole pool, searchable by title or artist. Days before 2026-10-20 (`EASIER_FROM`) keep the original stripes-first stages and whole-pool rotation, so published puzzles never change.

- **Pool.** `generator/paintings.csv` lists public-domain paintings by museum object ID: the [Art Institute of Chicago API](https://api.artic.edu/docs/) (`aic`) or the [Met Collection API](https://metmuseum.github.io/) (`met`), with the title, artist, year, nationality and movement the game shows. `python generator/generate_palette.py --check-pool` looks up every entry and, for a row with no `object_id`, searches the museum for candidates. After editing the CSV, rebuild the game's list with `--guess-list web/public/data/paintings.json`.
- **Generator.** `generator/generate_palette.py` downloads the day's image (only when the museum marks it public domain and the artist matches the pool), takes the palette with k-means, and writes six small PNG stages, a reveal image and `puzzle.json` to `web/public/puzzles/palette/<date>/`. Scheduling works like Contour's: a seeded shuffle, and a painting that can't be used hands the day to the next one. A network failure fails the run instead of skipping, so every run agrees on the answer.
- **Credit.** The result screen names the museum and links to the painting's page there.

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
python generator/generate_palette.py --out web/public/puzzles/palette

cd web
npm install
npm run dev
```

Tests: `python -m pytest generator/tests` and `cd web && npm test`. The Night Lights tests use synthetic tiles, so they run offline.

The countries list the game uses (`web/public/data/countries.json`) is generated from Natural Earth:

```sh
python generator/contour_gen/countries.py --out web/public/data/countries.json
```
