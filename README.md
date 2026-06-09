# Buzzin

Buzzin is a lightweight multiplayer reaction-timing web app — a React + Vite frontend served by nginx and a small Node.js HTTP API that holds rooms in memory. It's intended as a small demo project for building real-time-style interactions without a database.

**Contents:**

- Frontend: React, Vite (src/)
- API: Node.js (server/index.js)
- Docker: Multi-stage build for the frontend and a simple `server` service

## Quickstart (local)

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

The Vite dev server proxies `/api` to `http://localhost:4000` during development.

## Running with Docker

Build and run both services with Docker Compose (nginx exposes the app on port 3000):

```bash
docker compose up --build
# app → http://localhost:3000
```

Notes:
- The root `Dockerfile` performs a multi-stage build: Node builds the bundle, then `nginx` serves `dist/`.
- `docker-compose.yml` defines `app` and `server` services; nginx proxies `/api` to the `server` container.

## Project layout (high level)

```
.
├── server/                 # Node API (in-memory rooms)
├── src/                    # React app (Vite)
│   ├── components/         # UI components
│   └── store/rooms.js      # API helper used by frontend
├── Dockerfile              # frontend multi-stage build → nginx
├── nginx.conf              # nginx config: proxy /api → server
└── docker-compose.yml
```

## Development tips

- If you add dependencies to `package.json`, run `npm install` locally and commit the lockfile (`package-lock.json`) so Docker builds can use `npm ci` for reproducible installs.
- To reproduce the build step locally (helps debug Docker build failures):

```bash
npm ci
npm run build
```

## API (summary)

- `POST /rooms` — create a room (body: `{ sessionId, username }`)
- `POST /rooms/:code/join` — join room (body: `{ sessionId, username }`)
- `POST /rooms/:code/leave` — leave room (body: `{ sessionId }`)
- `GET /rooms/:code` — fetch room view

See `server/index.js` for the full behavior and additional endpoints (teams, race lifecycle).

## Troubleshooting

- Build failure in Docker: run `npm run build` locally to see Vite errors rather than debugging inside the image.
- If Dockerfile installs fail, ensure `package-lock.json` is present or allow the Dockerfile to fall back to `npm install` (the project Dockerfile already handles this).

## License

MIT — for demo and learning purposes.
