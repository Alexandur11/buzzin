import http from 'http'

const PORT = process.env.PORT || 4000
const RACE_DURATION_MS = 10_000

// ─── Store shape ─────────────────────────────────────────────────────────────
//
// Room {
//   code, createdAt, creatorId,
//   members:  Map<sid, { username, points, teamName|null }>,
//   teams:    Map<teamName, Set<sid>>,
//   race: null | {
//     id, status, startTime,
//     submissions: Map<sid, ms>,
//     timer
//   }
// }

const rooms = new Map()
const CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

function generateCode() {
  let c = ''
  for (let i = 0; i < 6; i++) {
    if (i === 3) c += '-'
    c += CHARS[Math.floor(Math.random() * CHARS.length)]
  }
  return c
}

function uid() { return Math.random().toString(36).slice(2, 10) }

// ─── Views ───────────────────────────────────────────────────────────────────

function leaderboardView(room) {
  return [...room.members.entries()]
    .map(([sid, m]) => ({ sessionId: sid, username: m.username, points: m.points, team: m.teamName ?? null }))
    .sort((a, b) => b.points - a.points)
}

function teamsView(room) {
  return [...room.teams.entries()].map(([name, members]) => ({
    name,
    members: [...members].map(sid => ({
      sessionId: sid,
      username: room.members.get(sid)?.username ?? '?',
    })),
  }))
}

function raceView(race, members, teams) {
  if (!race) return null

  const responded = [...race.submissions.entries()]
    .map(([sid, ms]) => {
      const m = members.get(sid)
      return { sessionId: sid, username: m?.username ?? '?', team: m?.teamName ?? null, reactionTime: ms, noResponse: false }
    })
    .sort((a, b) => a.reactionTime - b.reactionTime)

  const noResponse = race.status === 'closed'
    ? [...members.keys()]
        .filter(sid => !race.submissions.has(sid))
        .map(sid => {
          const m = members.get(sid)
          return { sessionId: sid, username: m?.username ?? '?', team: m?.teamName ?? null, reactionTime: null, noResponse: true }
        })
    : []

  // Team summary — first click per team (only teams with at least one submission)
  const teamSummary = []
  const seenTeams = new Set()
  for (const r of responded) {
    if (r.team && !seenTeams.has(r.team)) {
      seenTeams.add(r.team)
      teamSummary.push({ team: r.team, username: r.username, reactionTime: r.reactionTime })
    }
  }

  return {
    id: race.id,
    status: race.status,
    startTime: race.startTime,
    results: [...responded, ...noResponse],
    teamSummary,
  }
}

function roomView(room) {
  return {
    code: room.code,
    createdAt: room.createdAt,
    creatorId: room.creatorId,
    memberCount: room.members.size,
    leaderboard: leaderboardView(room),
    teams: teamsView(room),
    race: raceView(room.race, room.members, room.teams),
  }
}

// ─── Race lifecycle ───────────────────────────────────────────────────────────

function closeRace(room) {
  const { race } = room
  if (!race || race.status === 'closed') return
  race.status = 'closed'
  clearTimeout(race.timer)

  const ranked = [...race.submissions.entries()].sort((a, b) => a[1] - b[1])
  const total = ranked.length
  ranked.forEach(([sid], idx) => {
    const m = room.members.get(sid)
    if (m) m.points += Math.max(1, total - idx)
  })
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
}

function json(res, status, data) {
  cors(res)
  const body = JSON.stringify(data)
  res.writeHead(status, { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) })
  res.end(body)
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let d = ''
    req.on('data', c => { d += c })
    req.on('end', () => { try { resolve(d ? JSON.parse(d) : {}) } catch { reject(new Error('Invalid JSON')) } })
    req.on('error', reject)
  })
}

// ─── Router ──────────────────────────────────────────────────────────────────

const server = http.createServer(async (req, res) => {
  const { method, url } = req

  if (method === 'OPTIONS') { cors(res); res.writeHead(204); return res.end() }

  try {

    // POST /rooms
    if (method === 'POST' && url === '/rooms') {
      const { sessionId, username } = await readBody(req)
      if (!sessionId || !username?.trim()) return json(res, 400, { error: 'sessionId and username required' })
      let code; do { code = generateCode() } while (rooms.has(code))
      const room = {
        code, createdAt: Date.now(), creatorId: sessionId,
        members: new Map([[sessionId, { username: username.trim(), points: 0, teamName: null }]]),
        teams: new Map(),
        race: null,
      }
      rooms.set(code, room)
      return json(res, 201, roomView(room))
    }

    // POST /rooms/:code/join
    const joinMatch = url.match(/^\/rooms\/([A-Z0-9-]+)\/join$/)
    if (method === 'POST' && joinMatch) {
      const code = joinMatch[1].toUpperCase()
      const { sessionId, username } = await readBody(req)
      if (!sessionId || !username?.trim()) return json(res, 400, { error: 'sessionId and username required' })
      const room = rooms.get(code)
      if (!room) return json(res, 404, { error: 'Room not found' })
      if (!room.members.has(sessionId))
        room.members.set(sessionId, { username: username.trim(), points: 0, teamName: null })
      return json(res, 200, roomView(room))
    }

    // POST /rooms/:code/leave
    const leaveMatch = url.match(/^\/rooms\/([A-Z0-9-]+)\/leave$/)
    if (method === 'POST' && leaveMatch) {
      const code = leaveMatch[1].toUpperCase()
      const { sessionId } = await readBody(req)
      const room = rooms.get(code)
      if (room && sessionId) {
        // Remove from team
        const m = room.members.get(sessionId)
        if (m?.teamName) {
          const t = room.teams.get(m.teamName)
          if (t) { t.delete(sessionId); if (t.size === 0) room.teams.delete(m.teamName) }
        }
        room.members.delete(sessionId)
        if (room.members.size === 0) { if (room.race?.timer) clearTimeout(room.race.timer); rooms.delete(code) }
      }
      return json(res, 200, { ok: true })
    }

    // GET /rooms/:code
    const getMatch = url.match(/^\/rooms\/([A-Z0-9-]+)$/)
    if (method === 'GET' && getMatch) {
      const code = getMatch[1].toUpperCase()
      const room = rooms.get(code)
      if (!room) return json(res, 404, { error: 'Room not found' })
      return json(res, 200, roomView(room))
    }

    // POST /rooms/:code/teams/create
    const teamCreateMatch = url.match(/^\/rooms\/([A-Z0-9-]+)\/teams\/create$/)
    if (method === 'POST' && teamCreateMatch) {
      const code = teamCreateMatch[1].toUpperCase()
      const { sessionId, teamName } = await readBody(req)
      const trimmed = teamName?.trim()
      if (!sessionId || !trimmed) return json(res, 400, { error: 'sessionId and teamName required' })
      const room = rooms.get(code)
      if (!room) return json(res, 404, { error: 'Room not found' })
      if (room.teams.has(trimmed)) return json(res, 409, { error: 'Team name already taken' })
      const member = room.members.get(sessionId)
      if (!member) return json(res, 403, { error: 'Not a room member' })

      // Leave current team first
      if (member.teamName) {
        const old = room.teams.get(member.teamName)
        if (old) { old.delete(sessionId); if (old.size === 0) room.teams.delete(member.teamName) }
      }

      room.teams.set(trimmed, new Set([sessionId]))
      member.teamName = trimmed
      return json(res, 201, roomView(room))
    }

    // POST /rooms/:code/teams/join
    const teamJoinMatch = url.match(/^\/rooms\/([A-Z0-9-]+)\/teams\/join$/)
    if (method === 'POST' && teamJoinMatch) {
      const code = teamJoinMatch[1].toUpperCase()
      const { sessionId, teamName } = await readBody(req)
      const trimmed = teamName?.trim()
      if (!sessionId || !trimmed) return json(res, 400, { error: 'sessionId and teamName required' })
      const room = rooms.get(code)
      if (!room) return json(res, 404, { error: 'Room not found' })
      const team = room.teams.get(trimmed)
      if (!team) return json(res, 404, { error: 'Team not found' })
      const member = room.members.get(sessionId)
      if (!member) return json(res, 403, { error: 'Not a room member' })

      // Leave current team
      if (member.teamName && member.teamName !== trimmed) {
        const old = room.teams.get(member.teamName)
        if (old) { old.delete(sessionId); if (old.size === 0) room.teams.delete(member.teamName) }
      }

      team.add(sessionId)
      member.teamName = trimmed
      return json(res, 200, roomView(room))
    }

    // POST /rooms/:code/teams/leave
    const teamLeaveMatch = url.match(/^\/rooms\/([A-Z0-9-]+)\/teams\/leave$/)
    if (method === 'POST' && teamLeaveMatch) {
      const code = teamLeaveMatch[1].toUpperCase()
      const { sessionId } = await readBody(req)
      const room = rooms.get(code)
      if (!room) return json(res, 404, { error: 'Room not found' })
      const member = room.members.get(sessionId)
      if (member?.teamName) {
        const t = room.teams.get(member.teamName)
        if (t) { t.delete(sessionId); if (t.size === 0) room.teams.delete(member.teamName) }
        member.teamName = null
      }
      return json(res, 200, roomView(room))
    }

    // POST /rooms/:code/race/start
    const startMatch = url.match(/^\/rooms\/([A-Z0-9-]+)\/race\/start$/)
    if (method === 'POST' && startMatch) {
      const code = startMatch[1].toUpperCase()
      const { sessionId } = await readBody(req)
      const room = rooms.get(code)
      if (!room) return json(res, 404, { error: 'Room not found' })
      if (room.creatorId !== sessionId) return json(res, 403, { error: 'Only the room creator can start a race' })
      if (room.race?.status === 'active') return json(res, 409, { error: 'Race already active' })
      if (room.race?.timer) clearTimeout(room.race.timer)
      const startTime = Date.now()
      const timer = setTimeout(() => closeRace(room), RACE_DURATION_MS)
      room.race = { id: uid(), status: 'active', startTime, submissions: new Map(), timer }
      return json(res, 200, roomView(room))
    }

    // POST /rooms/:code/race/stop
    const stopMatch = url.match(/^\/rooms\/([A-Z0-9-]+)\/race\/stop$/)
    if (method === 'POST' && stopMatch) {
      const code = stopMatch[1].toUpperCase()
      const { sessionId } = await readBody(req)
      const room = rooms.get(code)
      if (!room) return json(res, 404, { error: 'Room not found' })
      if (room.creatorId !== sessionId) return json(res, 403, { error: 'Only the room creator can stop a race' })
      if (!room.race || room.race.status === 'closed') return json(res, 409, { error: 'No active race to stop' })
      closeRace(room)
      return json(res, 200, roomView(room))
    }

    // POST /rooms/:code/race/submit
    const submitMatch = url.match(/^\/rooms\/([A-Z0-9-]+)\/race\/submit$/)
    if (method === 'POST' && submitMatch) {
      const code = submitMatch[1].toUpperCase()
      const { sessionId } = await readBody(req)
      if (!sessionId) return json(res, 400, { error: 'sessionId required' })
      const room = rooms.get(code)
      if (!room) return json(res, 404, { error: 'Room not found' })
      const { race } = room
      if (!race) return json(res, 409, { error: 'No active race' })
      const elapsed = Date.now() - race.startTime
      if (race.status === 'closed' || elapsed > RACE_DURATION_MS) { closeRace(room); return json(res, 409, { error: 'time_up' }) }
      if (race.submissions.has(sessionId)) return json(res, 409, { error: 'already_submitted' })
      race.submissions.set(sessionId, elapsed)
      return json(res, 200, { reactionTime: elapsed })
    }

    json(res, 404, { error: 'Not found' })

  } catch (err) {
    console.error(err)
    json(res, 500, { error: 'Internal server error' })
  }
})

server.listen(PORT, () => console.log(`Buzzin server running on port ${PORT}`))
