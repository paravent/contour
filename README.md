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

## One-time setup

1. **Settings → Pages → Build and deployment → Source: GitHub Actions.**
2. **Settings → Secrets and variables → Actions → New repository secret** named `CONTOUR_SEED`, set to any long random string. Without it, the schedule uses the public dev seed in `generator/config.json`, and anyone could work out future answers.
3. Run **Actions → Daily puzzles → Run workflow** once, or push to `main`.

`generator/config.json` holds the launch date, which is puzzle #1.

## Local development

```sh
pip install -r generator/requirements.txt
python generator/generate.py --out web/public/puzzles/contour   # yesterday, today, tomorrow (UTC)

cd web
npm install
npm run dev
```

Tests: `python -m pytest generator/tests` and `cd web && npm test`.

The countries list the game uses (`web/public/data/countries.json`) is generated from Natural Earth:

```sh
python generator/contour_gen/countries.py --out web/public/data/countries.json
```
