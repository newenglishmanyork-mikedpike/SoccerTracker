# Soccer Tracker

A phone-friendly web app for youth soccer coaches to track **starting lineups, minutes played and goals**,
so every player gets fair game time across a match and a season.

- **Squad** – enter your players once.
- **Match setup** – mark who's here (late arrivals can be added any time), pick the starting lineup
  (or tap *Suggest* to pick the players with the fewest starts this season).
- **Live match** – running clock and score, tap ⚽ when someone scores, tap *Sub* to swap players.
  The bench is ordered by who has played least, with **Next on** / **Next off** suggestions,
  and each player's minutes are shown against the team's fair share. *Undo* reverses the last action.
- **Season** – games, starts, total/average minutes and goals per player, with players falling
  behind highlighted. Download a JSON backup or a CSV of the stats.

- **Account** – sign in (Google or email/password) to sync the squad and matches between devices; download/restore a backup.

Works offline and can be installed to the home screen (it's a PWA). Data is always saved on the device
first (IndexedDB), so the app works pitchside with no signal. When signed in, changes sync through
Firebase and are queued while offline. If two devices edit the same player or match, the latest edit wins.

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

## Setting up sync (Firebase, free tier)

Without this the app still works, but each device keeps its own data.

1. Go to <https://console.firebase.google.com>, **Create a project** (Google Analytics not needed).
2. **Build → Authentication → Get started → Sign-in method**:
   - **Email/Password → Enable → Save.**
   - **Add new provider → Google → Enable**, pick a support email, **Save**.
   - Then **Settings → Authorized domains → Add domain**: `<your-github-username>.github.io`
     (needed for Google sign-in).
3. **Build → Firestore Database → Create database**, pick a location near you, start in **production mode**.
   Then open its **Rules** tab, replace the contents with [`firestore.rules`](firestore.rules) and **Publish**.
4. **Project settings (⚙) → General → Your apps → Web (`</>`)**, register an app (no Hosting needed),
   and copy the `firebaseConfig = { ... }` snippet it shows.
5. In GitHub: **Settings → Secrets and variables → Actions → Variables → New repository variable**,
   name `FIREBASE_CONFIG`, paste the snippet as the value.
6. Re-run the **Deploy to GitHub Pages** workflow (Actions tab). The app now shows an **Account** sign-in.

The Firebase web config isn't secret — access is protected by sign-in and the Firestore rules, which
only let each account read and write its own data (`users/{uid}/...`).

To build locally with sync, put the snippet in `.env.local` as `VITE_FIREBASE_CONFIG=...`.
