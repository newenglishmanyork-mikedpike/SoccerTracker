# Soccer Tracker

A phone-friendly web app for youth soccer coaches to track **starting lineups, minutes played and goals**,
so every player gets fair game time across a match and a season.

- **Squad** – enter your players once.
- **Match setup** – mark who's here (late arrivals can be added any time), pick the starting lineup
  (or tap *Suggest* to pick the players with the fewest starts this season) and optionally a goalkeeper.
- **Live match** – running clock and score, tap ⚽ when someone scores, tap *Sub* to swap players.
  The bench is ordered by who has played least, with **Next on** / **Next off** suggestions,
  and each player's minutes are shown against the team's fair share. *Undo* reverses the last action.
- **Season** – games, starts, total/average minutes and goals per player, with players falling
  behind highlighted. Download a JSON backup or a CSV of the stats.

Works offline and can be installed to the home screen (it's a PWA). All data is stored on the device
(IndexedDB) — use *Download backup* regularly.

## Development

```bash
npm install
npm run dev      # local dev server
npm test         # unit tests for the minutes/score/suggestion logic
npm run build    # typecheck + production build into dist/
```

Stack: React + TypeScript + Vite, Dexie (IndexedDB), vite-plugin-pwa, Vitest.

### How time is tracked

Each match stores an append-only event log (`START`, `PERIOD_START`, `PERIOD_END`, `SUB`, `ON`, `OFF`,
`GOAL`, `OPP_GOAL`) with timestamps. Minutes, score and starts are computed by replaying the log
(`src/lib/matchState.ts`), so the clock stays correct if the phone locks, breaks between periods
don't count, and undo simply drops the last event.

## Deploying

`.github/workflows/deploy.yml` builds and publishes to GitHub Pages on every push to `main`.
Enable it once under **Settings → Pages → Source: GitHub Actions**.
