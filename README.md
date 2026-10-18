# Contour

A daily geography puzzle. You see an unlabelled contour map of somewhere on Earth and have six guesses to name the country. Each wrong guess zooms out and reveals more: the coastline, then the sea, then borders, then the first letter. Get it right and you get a GeoGuessr-style bonus: drop a pin on the exact spot for up to 5,000 points.

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

## Palette

The second live game: name a famous painting from its colours. Stage 1 is the painting's five dominant colours as stripes, as wide as their share of the canvas. Each wrong guess sharpens it: 4×4, 8×8, 16×16 and 32×32 pixel grids, then a soft blur. Clues unlock along the way (century, the artist's nationality, then initials), and every miss says whether the answer was painted earlier or later and whether you found the right artist or movement. Guesses come from a type-ahead over the whole pool, searchable by title or artist.

- **Pool.** `generator/paintings.csv` lists public-domain paintings by museum object ID: the [Art Institute of Chicago API](https://api.artic.edu/docs/) (`aic`) or the [Met Collection API](https://metmuseum.github.io/) (`met`), with the title, artist, year, nationality and movement the game shows. `python generator/generate_palette.py --check-pool` looks up every entry and, for a row with no `object_id`, searches the museum for candidates. After editing the CSV, rebuild the game's list with `--guess-list web/public/data/paintings.json`.
- **Generator.** `generator/generate_palette.py` downloads the day's image (only when the museum marks it public domain and the artist matches the pool), takes the palette with k-means, and writes six small PNG stages, a reveal image and `puzzle.json` to `web/public/puzzles/palette/<date>/`. Scheduling works like Contour's: a seeded shuffle, and a painting that can't be used hands the day to the next one. A network failure fails the run instead of skipping, so every run agrees on the answer.
- **Credit.** The result screen names the museum and links to the painting's page there.

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

Tests: `python -m pytest generator/tests` and `cd web && npm test`.

The countries list the game uses (`web/public/data/countries.json`) is generated from Natural Earth:

```sh
python generator/contour_gen/countries.py --out web/public/data/countries.json
```
