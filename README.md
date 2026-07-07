# Buzzin ⚡

**Buzzin** is a lightweight multiplayer reaction-timing game — a "buzz-in" race
like a quiz-show buzzer. A host creates a room, shares a code (or QR), and when
the race starts everyone tries to tap **BUZZ!** as fast as they can. The server
records each player's reaction time, ranks them live, and the host can award
points, form teams, and review the history of every round.

It's a small demo of **real-time-style interaction without a database** — all
state lives in server memory, and clients stay in sync by polling. React + Vite
on the front, a tiny dependency-free Node HTTP API on the back, nginx in front
for production.

> 📐 For a full technical breakdown (data model, race lifecycle, endpoints, where
> to make changes) see **[PROJECT-ARCHITECTURE.md](PROJECT-ARCHITECTURE.md)**.

---

## Features

- 🎯 **Reaction races** — synchronized countdown, then a race to buzz; times
  measured server-side in milliseconds.
- 🥇 **Live leaderboard** — points ranking with medals, updated as you play.
- 👥 **Teams** — create/join teams; award points per player or per whole team.
- 🎛️ **Host controls** — start/stop races, award/deduct points, reset scores,
  kick players.
- 🕵️ **Fakeout anti-cheat** — optional random 0–5s hidden delay after the
  countdown; jumping the gun disqualifies the click.
- 🔊 **8 synthesized buzzer sounds** — generated with the Web Audio API (no audio
  files), chosen by the host for the whole room.
- 📱 **Mobile-friendly** — responsive layout, QR-code room joins, survives tab
  backgrounding and reconnects.
- 📜 **Session history** — collapsible per-race result tables (last 20 races).
- 🔗 **No database / no sign-up** — anonymous sessions, shareable room codes.

## How to play

1. **Create a room** and pick a username → you become the **host**.
2. **Share the room code** (or the QR code) so others can join — they open the
   app, hit *Join Room*, and enter the code.
3. *(optional)* Players **form teams**; the host tweaks **settings** (race length,
   countdown, rounds, fakeout, buzzer sound).
4. The host presses **Start Race**. Everyone sees a countdown, then **BUZZ!**.
5. Reaction times appear ranked live; when the race ends the host **awards
   points**. Repeat, and watch the **leaderboard**.

## Quickstart (local)

You need **Node.js 20+**. Run the API and the frontend in two terminals.

1. Start the API server

```bash
cd server
npm install
npm run dev
# server → http://localhost:4000
```

2. Start the frontend in a separate terminal

```bash
npm install
npm run dev
# frontend → http://localhost:5173
```

Open **http://localhost:5173**. The Vite dev server proxies `/api` to
`http://localhost:4000`, so no extra config is needed.

> 💡 **Testing multiplayer solo:** open a second browser tab (or an incognito
> window) and join with the room code — each tab gets its own session identity.
> On the same LAN, others can join via the `Network:` URL Vite prints.

## Running with Docker

Build and run both services with Docker Compose (nginx exposes the app on port 3000):

```bash
docker compose up --build
# app → http://localhost:3000
```

Notes:
- The root `Dockerfile` performs a multi-stage build: Node builds the bundle, then `nginx` serves `dist/`.
- `docker-compose.yml` defines `app` and `server` services; nginx proxies `/api` to the `server` container (the server is not exposed publicly).

## Configuration

| Variable        | Used by  | Default              | Purpose |
|-----------------|----------|----------------------|---------|
| `PORT`          | server   | `4000`               | Port the Node API listens on. |
| `VITE_API_URL`  | frontend | `/api`               | API base URL, **baked in at build time** by Vite. Relative `/api` works behind the Vite dev proxy and the nginx proxy; override only if the backend lives on a different origin. |

**Room defaults** (host-adjustable in Settings, clamped server-side):

| Setting          | Default | Range        |
|------------------|---------|--------------|
| Race duration    | 10s     | 3–30s        |
| Countdown        | 3s      | 1–10s        |
| Max rounds       | ∞ (0)   | 0–20         |
| Fakeout          | off     | on/off       |
| Buzzer sound     | Classic | 8 presets    |

## Tech stack

- **Frontend:** React 18, Vite 5 (plain JSX), hand-written CSS, `react-qr-code`,
  Web Audio API for sounds.
- **Backend:** Node.js built-in `http` module (no framework), ES modules,
  in-memory `Map` store, `setTimeout`-driven race timers.
- **Ops:** Docker multi-stage build, nginx (static serving + `/api` proxy + gzip
  + SPA fallback), Docker Compose.

## Project layout

```
.
├── server/
│   └── index.js            # Node API — router, in-memory rooms, race lifecycle
├── src/
│   ├── App.jsx             # top-level state (home vs in-room), silent rejoin
│   ├── main.jsx            # React entry
│   ├── sound.js            # Web Audio buzzer presets
│   ├── store/rooms.js      # the only module that talks to the API
│   └── components/         # Home, Room, RacePanel, Leaderboard, TeamsPanel,
│                           # AwardPoints, SettingsPanel, HistoryPanel, …
├── Dockerfile              # frontend multi-stage build → nginx
├── nginx.conf              # nginx: proxy /api → server, SPA fallback, caching
├── docker-compose.yml      # app + server services
├── vite.config.js          # dev server + /api proxy
└── PROJECT-ARCHITECTURE.md # full technical reference
```

## API overview

All endpoints live under `/api` in deployment and return the **full room
snapshot** (the client also polls that same view). Mutations require a
`sessionId`; host-only actions check the room creator.

| Endpoint                        | Purpose |
|---------------------------------|---------|
| `POST /rooms`                   | Create a room |
| `POST /rooms/:code/join`        | Join / rejoin |
| `GET  /rooms/:code`             | Poll room state |
| `POST /rooms/:code/race/start`  | Host starts a race |
| `POST /rooms/:code/race/submit` | Buzz (record reaction time) |
| `POST /rooms/:code/award`       | Host awards points |
| …                               | teams, kick, settings, stop, reset — see [PROJECT-ARCHITECTURE.md](PROJECT-ARCHITECTURE.md#44-http-api-surface) |

## Development tips

- If you add dependencies to `package.json`, run `npm install` locally and commit the lockfile (`package-lock.json`) so Docker builds can use `npm ci` for reproducible installs.
- To reproduce the build step locally (helps debug Docker build failures):

```bash
npm ci
npm run build
```

- The buzzer-sound preset ids are **defined in two places** —
  [`src/sound.js`](src/sound.js) (`PRESETS`) and the `BUZZ_SOUNDS` set in
  [`server/index.js`](server/index.js). Keep them in sync when adding a sound.

## Troubleshooting

- **Build failure in Docker:** run `npm run build` locally to see Vite errors rather than debugging inside the image.
- **Dockerfile installs fail:** ensure `package-lock.json` is present, or let the Dockerfile fall back to `npm install` (it already handles this).
- **Rooms disappear after a restart:** expected — all state is in memory. Idle
  rooms are also swept after 30 minutes.
- **No buzzer sound on the first click:** browsers only allow audio after a user
  gesture; the `AudioContext` resumes on the first tap.

## Limitations

This is intentionally a small demo, not production infrastructure:

- **Single instance** — in-memory state doesn't scale horizontally, and a
  restart wipes all rooms.
- **Polling, not push** — fine for a small group; not built for large/many rooms.
- **No auth, open CORS, no rate limiting** — meant for a trusted group.
- **No tests / CI**, and lockfiles aren't committed yet.

## License

MIT — for demo and learning purposes.
