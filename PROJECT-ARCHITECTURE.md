# Buzzin — Project Architecture

> Reference document describing the whole application. Use this as a shared
> map when giving instructions (e.g. "change the race lifecycle in the server"
> or "update the RacePanel buzz behavior").

## 1. What it is

**Buzzin** is a lightweight multiplayer reaction-timing / buzz-in game (think
quiz-show buzzer). A **host** creates a room and shares a 6-character code (or a
QR code). Players join, and when the host starts a race everyone sees a
countdown; the moment it turns "active" players race to tap **BUZZ!**. The
server records each player's reaction time, ranks them live, and the host can
award points, run teams, kick players, and review a per-race history.

Deliberately minimal: **no database, no auth, no WebSockets.** All state lives
in server process memory; the client stays in sync by **HTTP polling**.

## 2. Tech stack

| Layer      | Technology                          | Location            |
|------------|-------------------------------------|---------------------|
| Frontend   | React 18 + Vite 5 (JSX, no TS)      | [src/](src/)        |
| Styling    | Hand-written CSS, one file per component | `src/**/*.css` |
| API        | Node.js built-in `http` (no framework, ESM) | [server/index.js](server/index.js) |
| Audio      | Web Audio API, synthesized at runtime | [src/sound.js](src/sound.js) |
| QR codes   | `react-qr-code`                     | used in [Room.jsx](src/components/Room.jsx) |
| Deploy     | Docker Compose: nginx (static + `/api` proxy) + Node server | [docker-compose.yml](docker-compose.yml), [nginx.conf](nginx.conf) |

There is **no test suite, no linter, and no lockfiles** committed.

## 3. High-level topology

```
┌─────────────────────────────┐        ┌──────────────────────────────┐
│  Browser (React SPA)        │        │  Node HTTP API (:4000)       │
│                             │        │                              │
│  localStorage:              │        │  rooms: Map<code, Room>      │
│    buzzin_sid  (identity)   │        │    (all state in memory)     │
│    buzzin_room / _username  │        │  setTimeout race timers      │
│                             │        │  hourly idle-room sweep      │
│  poll loop ──GET /rooms/:c──┼──/api──┼─▶ full room snapshot         │
│  actions ───POST ...────────┼──/api──┼─▶ mutate + return snapshot   │
└─────────────────────────────┘        └──────────────────────────────┘
        ▲ dev: Vite proxies /api → :4000
        ▲ prod: nginx proxies /api → server:4000
```

**Key design choice:** every mutating endpoint returns the **full room view**,
and the client also polls that same view (fast during a race, slow when idle).
There is no diffing or push — the room snapshot is the single source of truth.

## 4. Backend — [server/index.js](server/index.js)

A single ~490-line file: a hand-rolled router over `http.createServer`.

### 4.1 In-memory data model

```
rooms: Map<code, Room>

Room {
  code, createdAt, creatorId, lastActivityAt,
  raceNumber,                       // increments each race
  settings: { raceDurationMs, countdownMs, maxRounds, fakeoutEnabled, buzzSound },
  members:  Map<sid, { username, points, teamName|null }>,
  teams:    Map<teamName, Set<sid>>,
  history:  Array<race snapshot>,   // capped at last 20
  race:     null | Race,
  exMembers: Map<sid, { username, points, teamName, expiresAt }>,  // 30-min TTL
  kicked:   Set<sid>,
}

Race {
  id, status,                       // 'countdown' | 'active' | 'closed'
  countdownEnd, startTime, raceDurationMs,
  submissions: Map<sid, reactionMs>,
  earlyClicks: Set<sid>,
  timer,                            // setTimeout handle
}
```

- **Identity** is the client-generated `sessionId` (`buzzin_sid`). No passwords;
  the room `creatorId` = host and is the only one allowed to run privileged
  actions.
- **exMembers**: when someone leaves, their score/team is stashed for 30 min so a
  refresh or reconnect restores their standing. Kicked players are *not* restored.
- **Cleanup**: leaving empties → room deleted; an hourly `setInterval` sweeps
  rooms idle for >30 min (`ROOM_IDLE_TTL_MS`).

### 4.2 Race lifecycle

Driven entirely by server-side `setTimeout` (clients only *display* time):

1. `POST /race/start` → `status: 'countdown'`, `countdownEnd = now + countdownMs`.
2. After `countdownMs (+ optional fakeout)` → `status: 'active'`, `startTime = now`,
   arms a second timer for `raceDurationMs`.
3. Timer fires **or** host stops **or** a late submit arrives → `closeRace()`:
   `status: 'closed'`, snapshot pushed to `history` (trimmed to 20).

- **Fakeout / anti-cheat** (`fakeoutEnabled`): adds a random **0–5s hidden delay**
  after the visible countdown. Anyone who clicks during countdown lands in
  `earlyClicks` and is disqualified.
- **Submit** (`POST /race/submit`): during countdown → recorded as early click
  (409 `early_click`); during active → `reactionTime = now - startTime` stored;
  after duration/closed → 409 `time_up`; duplicate → 409 `already_submitted`.

### 4.3 View builders (server → client shape)

- `roomView(room)` — the canonical payload every endpoint returns. Also stamps
  `lastActivityAt`. Contains: `code, createdAt, creatorId, memberCount,
  raceNumber, settings, leaderboard[], teams[], race, history[]`.
- `leaderboardView` — members sorted by points desc.
- `teamsView` — teams with their member usernames.
- `raceView` — merges `responded` (sorted by time) + `earlyClicks` + `noResponse`
  (only when closed) into `results[]`, plus a `teamSummary[]` (first click per team).

### 4.4 HTTP API surface

All under `/api` in deployment. Body is JSON with `sessionId` (+ fields). CORS is
open (`*`). Host-only endpoints check `room.creatorId === sessionId`.

| Method & path                    | Who    | Purpose |
|----------------------------------|--------|---------|
| `POST /rooms`                    | anyone | Create room (returns code) |
| `POST /rooms/:code/join`         | anyone | Join / rejoin (restores exMember state) |
| `POST /rooms/:code/leave`        | anyone | Leave (sent via `sendBeacon` on unload) |
| `GET  /rooms/:code`              | anyone | Poll full room view (403 if kicked) |
| `POST /rooms/:code/teams/create` | member | Create + join a team |
| `POST /rooms/:code/teams/join`   | member | Join existing team |
| `POST /rooms/:code/teams/leave`  | member | Leave current team |
| `POST /rooms/:code/kick`         | host   | Kick a player (adds to `kicked`) |
| `POST /rooms/:code/award`        | host   | Award points to player or whole team |
| `POST /rooms/:code/settings`     | host   | Update settings (locked mid-race) |
| `POST /rooms/:code/race/start`   | host   | Begin countdown → race |
| `POST /rooms/:code/race/stop`    | host   | End race early |
| `POST /rooms/:code/race/submit`  | member | Buzz — record reaction / early / late |
| `POST /rooms/:code/scores/reset` | host   | Zero all scores |

**Settings clamps** (server-enforced): `raceDurationMs` 3–30s, `countdownMs`
1–10s, `maxRounds` 0–20 (0 = unlimited), `buzzSound` must be in the allowed set.

## 5. Frontend — [src/](src/)

### 5.1 Entry & top-level state

- [main.jsx](src/main.jsx) mounts `<App/>`.
- [App.jsx](src/components/../App.jsx) holds the single big piece of state:
  `currentRoom` (null = home screen, object = in a room). It also:
  - Attempts a **silent rejoin** on load from `localStorage` (`getLastSession`).
  - Reads `?join=CODE` from the URL to pre-fill the join form (QR deep-link).
  - Fires `leaveRoom` on `beforeunload`.

### 5.2 API client — [src/store/rooms.js](src/store/rooms.js)

The **only** module that talks to the backend. Owns:
- `SESSION_ID` (from `localStorage.buzzin_sid`) and last-session helpers.
- Base URL: `import.meta.env.VITE_API_URL || '/api'` — relative by default so it
  works over LAN / deployed hosts without hardcoding an address.
- `post()` / `get()` wrappers that inject `sessionId` and throw an Error whose
  `.code` is the server's error string (e.g. `early_click`, `time_up`, `kicked`).
- One exported function per endpoint (`createRoom`, `joinRoom`, `pollRoom`,
  `startRace`, `submitReaction`, `awardPoints`, …). `leaveRoom` uses
  `navigator.sendBeacon` so it survives page unload.

### 5.3 Component tree

```
App
├── Home                    (create / join tabs; not-in-room screen)
│   └── UsernameModal       (pick username before entering)
└── Room                    (in-room shell; owns the poll loop)
    ├── Leaderboard         (points ranking, medals)
    ├── AwardPoints         (host: quick-tap ± chips, custom, reset — player/team)
    ├── TeamsPanel          (create/join/leave teams, member lists)
    ├── RacePanel           (the game: countdown, BUZZ button, live/final results)
    ├── SettingsPanel       (host: duration/countdown/rounds/fakeout/sound sliders)
    └── HistoryPanel        (collapsible per-race result tables, last 20)
```

`src/components/index.js` re-exports all components (barrel), though most imports
are direct.

### 5.4 [Room.jsx](src/components/Room.jsx) — the sync engine

- **Poll loop**: `POLL_ACTIVE = 800ms` during countdown/active, `POLL_IDLE =
  2500ms` otherwise, with `RECONNECT_BACKOFF` on failure and a connection banner
  (`connected` / `reconnecting` / `disconnected`).
- **Visibility refresh**: forces an immediate poll on `visibilitychange` /
  `pageshow` because mobile browsers suspend timers in backgrounded tabs.
- **Responsive layout**: `useIsMobile()` (640px breakpoint) switches between a
  single-tab mobile view and a two-column desktop view (sidebar + main). The same
  panel elements are shared between both.
- **Room code UX**: copy button (with a non-secure-context `execCommand`
  fallback) and a QR modal encoding `${origin}?join=${code}`.
- Derives `isCreator`, `myTeam`, `raceActive` from the polled room.

### 5.5 [RacePanel.jsx](src/components/RacePanel.jsx) — the game UI

- Local tickers (50ms) render the countdown and the race timer from
  `race.countdownEnd` / `race.startTime` (server clock, echoed via polls).
- **Buzz flow**: plays instant audio on press (`playEarly()` during countdown,
  `playBuzz(settings.buzzSound)` when active) *before* the server round-trip, then
  reconciles state from the response / error code.
- Reconstructs the player's own state from `race.results` so a refresh mid-race
  restores whether they buzzed / were early / their time.
- Renders live/final results table + team summary; host gets Start/Stop controls.

### 5.6 [sound.js](src/sound.js) — synthesized buzzers

- No audio assets. A single lazy `AudioContext` → compressor → makeup gain bus.
  Helpers `tone()` (oscillator + ADSR + optional sweep/filter/vibrato) and
  `noise()` (filtered noise bursts) build layered voices.
- 8 presets in `PRESETS`: `classic, gameshow, arcade, airhorn, laser, ding,
  chime, bell`. Exports `BUZZ_SOUNDS` (`{id,label}[]` for the picker),
  `DEFAULT_BUZZ_SOUND`, `playBuzz(sound)`, `playEarly()`.
- **Important:** the preset id list is mirrored on the server as `BUZZ_SOUNDS`
  in [server/index.js](server/index.js) — **keep both in sync** when adding sounds.

## 6. Deployment & config

- **Dev**: run `server` (`npm run dev`, node --watch, :4000) and the Vite dev
  server (`npm run dev`, :5173). Vite proxies `/api` → `:4000`
  ([vite.config.js](vite.config.js)).
- **Docker** ([docker-compose.yml](docker-compose.yml)): `app` (multi-stage
  [Dockerfile](Dockerfile) → nginx serving `dist/`, published on host **:3000**)
  and `server` (internal only). nginx proxies `/api/` → `server:4000`
  ([nginx.conf](nginx.conf)) and does SPA fallback + asset caching + gzip.
- **Env**: `VITE_API_URL` (build-time, baked by Vite; defaults to `/api` in
  compose) and `PORT` for the server.

## 7. Known gaps / constraints (context for future work)

- **Single instance only** — in-memory state; no horizontal scaling and a server
  restart wipes all rooms. Fine for one trusted group.
- **Polling, not push** — each active poll pulls the full room view every 800ms.
  Won't scale to large/many rooms. (`server/package.json` still lists an unused
  `ws` dependency from an earlier WebSocket design.)
- **No lockfiles** — Dockerfiles fall back to `npm install`; builds aren't
  reproducible until `package-lock.json` files are committed.
- **No tests / lint / CI.**
- **Open CORS, no rate limiting, anonymous identity** — acceptable for a
  trusted-group demo, not for public exposure.
- **`.gitignore`** is Python-derived; `node_modules/` was added on top.

## 8. Where to make common changes

| I want to change…                    | Go to |
|--------------------------------------|-------|
| Race rules / timing / anti-cheat     | [server/index.js](server/index.js) (race lifecycle) + [RacePanel.jsx](src/components/RacePanel.jsx) |
| A new API endpoint                    | [server/index.js](server/index.js) router + a wrapper in [store/rooms.js](src/store/rooms.js) |
| Settings (bounds, new option)         | `DEFAULT_SETTINGS` + `/settings` handler in server, [SettingsPanel.jsx](src/components/SettingsPanel.jsx) |
| Buzz sounds                           | [sound.js](src/sound.js) **and** the `BUZZ_SOUNDS` set in server |
| Points / awarding / reset             | `/award`, `/scores/reset` in server + [AwardPoints.jsx](src/components/AwardPoints.jsx) |
| Teams behavior                        | `/teams/*` in server + [TeamsPanel.jsx](src/components/TeamsPanel.jsx) |
| Poll cadence / reconnect              | constants at top of [Room.jsx](src/components/Room.jsx) |
| Layout / responsive breakpoint        | [Room.jsx](src/components/Room.jsx) `useIsMobile` + component CSS |
| Deployment / proxy / ports            | [docker-compose.yml](docker-compose.yml), [nginx.conf](nginx.conf), [vite.config.js](vite.config.js) |
