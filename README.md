# Buzzin

React frontend + Node.js REST API. Rooms and membership are held in server memory.

## Local Development

**Terminal 1 — API server:**
```bash
cd server
npm install
npm run dev   # → http://localhost:4000
```

**Terminal 2 — Frontend:**
```bash
npm install
npm run dev   # → http://localhost:5173
```

The Vite dev server proxies `/api` to `:4000` automatically.

## Docker (Production)

```bash
docker compose up --build
# → http://localhost:3000
```

Both services start together. nginx proxies `/api/*` to the server container internally — only port 3000 is exposed.

## Project Structure

```
buzzin-app/
├── src/
│   ├── store/rooms.js         # API client + session ID
│   ├── components/
│   │   ├── Home.jsx / .css    # Create or join a room
│   │   └── Room.jsx / .css    # Room view with live member count
│   ├── App.jsx / .css
│   ├── index.css
│   └── main.jsx
├── server/
│   ├── index.js               # HTTP REST API (no dependencies except ws built-in http)
│   ├── package.json
│   └── Dockerfile
├── Dockerfile                 # Multi-stage: Node build → nginx
├── nginx.conf                 # SPA routing + /api proxy + gzip
└── docker-compose.yml         # app + server services
```

## API

| Method | Path | Description |
|--------|------|-------------|
| POST | `/rooms` | Create room → `{ code, createdAt, memberCount }` |
| POST | `/rooms/:code/join` | Join room → same shape |
| POST | `/rooms/:code/leave` | Leave room (fires on tab close via sendBeacon) |
| GET | `/rooms/:code` | Get current member count |

All requests include `{ sessionId }` in the body. Membership is tracked as a `Set<sessionId>` per room — idempotent joins, accurate counts, empty rooms are deleted immediately.
