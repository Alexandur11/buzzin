import http from 'http'

const PORT = process.env.PORT || 4000

const DEFAULT_SETTINGS = {
  raceDurationMs: 10_000,
  countdownMs:     3_000,
  maxRounds:           0,
  fakeoutEnabled:  false,
}

// ─── Store shape ─────────────────────────────────────────────────────────────
//
// Room {
//   code, createdAt, creatorId, raceNumber,
//   settings: { raceDurationMs, countdownMs, maxRounds, fakeoutEnabled },
//   members:  Map<sid, { username, points, teamName|null }>,
//   teams:    Map<teamName, Set<sid>>,
//   history:  Array<race snapshot>,
//   race: null | {
//     id, status, countdownEnd, startTime, raceDurationMs,
//     submissions: Map<sid, ms>,
//     earlyClicks: Set<sid>,
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

function raceView(race, members) {
  if (!race) return null

  const responded = [...race.submissions.entries()]
    .map(([sid, ms]) => {
      const m = members.get(sid)
      return { sessionId: sid, username: m?.username ?? '?', team: m?.teamName ?? null, reactionTime: ms, earlyClick: false, noResponse: false }
    })
    .sort((a, b) => a.reactionTime - b.reactionTime)

  const earlyClicks = [...race.earlyClicks]
    .map(sid => {
      const m = members.get(sid)
      return { sessionId: sid, username: m?.username ?? '?', team: m?.teamName ?? null, reactionTime: null, earlyClick: true, noResponse: false }
    })

  const noResponse = race.status === 'closed'
    ? [...members.keys()]
        .filter(sid => !race.submissions.has(sid) && !race.earlyClicks.has(sid))
        .map(sid => {
          const m = members.get(sid)
          return { sessionId: sid, username: m?.username ?? '?', team: m?.teamName ?? null, reactionTime: null, earlyClick: false, noResponse: true }
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
    countdownEnd: race.countdownEnd,
    startTime: race.startTime,
    results: [...responded, ...earlyClicks, ...noResponse],
    teamSummary,
  }
}

function roomView(room) {
  room.lastActivityAt = Date.now()
  return {
    code: room.code,
    createdAt: room.createdAt,
    creatorId: room.creatorId,
    memberCount: room.members.size,
    raceNumber: room.raceNumber,
    settings: room.settings,
    leaderboard: leaderboardView(room),
    teams: teamsView(room),
    race: raceView(room.race, room.members),
    history: room.history,
  }
}

const EX_MEMBER_TTL_MS = 30 * 60 * 1000 // 30 minutes

function evictMember(room, sessionId) {
  const m = room.members.get(sessionId)
  if (!m) return
  if (m.teamName) {
    const t = room.teams.get(m.teamName)
    if (t) { t.delete(sessionId); if (t.size === 0) room.teams.delete(m.teamName) }
  }
  room.members.delete(sessionId)
  room.exMembers.set(sessionId, { username: m.username, points: m.points, teamName: m.teamName, expiresAt: Date.now() + EX_MEMBER_TTL_MS })
}

// ─── Race lifecycle ───────────────────────────────────────────────────────────

function closeRace(room) {
  const { race } = room
  if (!race || race.status === 'closed') return
  race.status = 'closed'
  clearTimeout(race.timer)

  const snapshot = raceView(race, room.members)
  room.history.push({ raceNumber: room.raceNumber, closedAt: Date.now(), ...snapshot })
  if (room.history.length > 20) room.history = room.history.slice(-20)
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-session-id')
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
      if (username.trim().length > 20) return json(res, 400, { error: 'Username too long (max 20 chars)' })
      let code; do { code = generateCode() } while (rooms.has(code))
      const room = {
        code, createdAt: Date.now(), creatorId: sessionId, lastActivityAt: Date.now(),
        raceNumber: 0,
        settings: { ...DEFAULT_SETTINGS },
        members: new Map([[sessionId, { username: username.trim(), points: 0, teamName: null }]]),
        teams: new Map(),
        history: [],
        race: null,
        exMembers: new Map(), // Map<sid, { username, points, teamName, expiresAt }>
        kicked: new Set(),
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
      if (username.trim().length > 20) return json(res, 400, { error: 'Username too long (max 20 chars)' })
      const room = rooms.get(code)
      if (!room) return json(res, 404, { error: 'Room not found' })
      if (!room.members.has(sessionId)) {
        // Prune expired exMembers
        for (const [sid, ex] of room.exMembers) { if (ex.expiresAt < Date.now()) room.exMembers.delete(sid) }
        const ex = room.exMembers.get(sessionId)
        if (ex) {
          const restoredTeam = ex.teamName && room.teams.has(ex.teamName) ? ex.teamName : null
          room.members.set(sessionId, { username: username.trim(), points: ex.points, teamName: restoredTeam })
          if (restoredTeam) room.teams.get(restoredTeam).add(sessionId)
          room.exMembers.delete(sessionId)
        } else {
          room.members.set(sessionId, { username: username.trim(), points: 0, teamName: null })
        }
        room.kicked.delete(sessionId) // rejoining manually un-kicks them
      } else {
        room.members.get(sessionId).username = username.trim()
      }
      return json(res, 200, roomView(room))
    }

    // POST /rooms/:code/leave
    const leaveMatch = url.match(/^\/rooms\/([A-Z0-9-]+)\/leave$/)
    if (method === 'POST' && leaveMatch) {
      const code = leaveMatch[1].toUpperCase()
      const { sessionId } = await readBody(req)
      const room = rooms.get(code)
      if (room && sessionId) {
        evictMember(room, sessionId)
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
      const pollerId = req.headers['x-session-id']
      if (pollerId && room.kicked?.has(pollerId)) return json(res, 403, { error: 'kicked' })
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

    // POST /rooms/:code/kick
    const kickMatch = url.match(/^\/rooms\/([A-Z0-9-]+)\/kick$/)
    if (method === 'POST' && kickMatch) {
      const code = kickMatch[1].toUpperCase()
      const { sessionId, targetId } = await readBody(req)
      const room = rooms.get(code)
      if (!room) return json(res, 404, { error: 'Room not found' })
      if (room.creatorId !== sessionId) return json(res, 403, { error: 'Only the room creator can kick players' })
      if (targetId === sessionId) return json(res, 400, { error: 'Cannot kick yourself' })
      if (!room.members.has(targetId)) return json(res, 404, { error: 'Player not found' })
      evictMember(room, targetId)
      room.kicked.add(targetId)
      room.exMembers.delete(targetId) // kicked players don't get their state restored
      return json(res, 200, roomView(room))
    }

    // POST /rooms/:code/award
    const awardMatch = url.match(/^\/rooms\/([A-Z0-9-]+)\/award$/)
    if (method === 'POST' && awardMatch) {
      const code = awardMatch[1].toUpperCase()
      const { sessionId, targetId, targetTeam, points } = await readBody(req)
      const room = rooms.get(code)
      if (!room) return json(res, 404, { error: 'Room not found' })
      if (room.creatorId !== sessionId) return json(res, 403, { error: 'Only the room creator can award points' })
      const pts = Math.round(Number(points))
      if (!pts || isNaN(pts)) return json(res, 400, { error: 'Invalid points value' })
      if (targetId) {
        const member = room.members.get(targetId)
        if (!member) return json(res, 404, { error: 'Player not found' })
        member.points += pts
      } else if (targetTeam) {
        const team = room.teams.get(targetTeam)
        if (!team) return json(res, 404, { error: 'Team not found' })
        for (const sid of team) {
          const m = room.members.get(sid)
          if (m) m.points += pts
        }
      } else {
        return json(res, 400, { error: 'targetId or targetTeam required' })
      }
      return json(res, 200, roomView(room))
    }

    // POST /rooms/:code/settings
    const settingsMatch = url.match(/^\/rooms\/([A-Z0-9-]+)\/settings$/)
    if (method === 'POST' && settingsMatch) {
      const code = settingsMatch[1].toUpperCase()
      const { sessionId, raceDurationMs, countdownMs, maxRounds, fakeoutEnabled } = await readBody(req)
      const room = rooms.get(code)
      if (!room) return json(res, 404, { error: 'Room not found' })
      if (room.creatorId !== sessionId) return json(res, 403, { error: 'Only the room creator can change settings' })
      if (room.race?.status === 'active' || room.race?.status === 'countdown')
        return json(res, 409, { error: 'Cannot change settings during an active race' })
      if (raceDurationMs != null) room.settings.raceDurationMs = Math.max(3_000, Math.min(30_000, Number(raceDurationMs)))
      if (countdownMs    != null) room.settings.countdownMs    = Math.max(1_000, Math.min(10_000, Number(countdownMs)))
      if (maxRounds      != null) room.settings.maxRounds      = Math.max(0, Math.min(20, Number(maxRounds)))
      if (fakeoutEnabled != null) room.settings.fakeoutEnabled = Boolean(fakeoutEnabled)
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
      if (room.race?.status === 'active' || room.race?.status === 'countdown')
        return json(res, 409, { error: 'Race already active' })
      const { raceDurationMs, countdownMs, maxRounds, fakeoutEnabled } = room.settings
      if (maxRounds > 0 && room.raceNumber >= maxRounds)
        return json(res, 409, { error: 'Max rounds reached' })
      if (room.race?.timer) clearTimeout(room.race.timer)

      const raceId       = uid()
      const fakeoutMs    = fakeoutEnabled ? Math.floor(Math.random() * 5_000) : 0
      const countdownEnd = Date.now() + countdownMs

      room.raceNumber++
      room.race = {
        id: raceId,
        status: 'countdown',
        countdownEnd,
        startTime: null,
        raceDurationMs,
        submissions: new Map(),
        earlyClicks: new Set(),
        timer: setTimeout(() => {
          if (!room.race || room.race.id !== raceId) return
          room.race.status    = 'active'
          room.race.startTime = Date.now()
          room.race.timer     = setTimeout(() => closeRace(room), raceDurationMs)
        }, countdownMs + fakeoutMs),
      }
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
      if (race.status === 'countdown') {
        if (race.earlyClicks.has(sessionId) || race.submissions.has(sessionId))
          return json(res, 409, { error: 'already_submitted' })
        race.earlyClicks.add(sessionId)
        return json(res, 409, { error: 'early_click' })
      }
      const elapsed = Date.now() - race.startTime
      if (race.status === 'closed' || elapsed > race.raceDurationMs) { closeRace(room); return json(res, 409, { error: 'time_up' }) }
      if (race.submissions.has(sessionId)) return json(res, 409, { error: 'already_submitted' })
      race.submissions.set(sessionId, elapsed)
      return json(res, 200, { reactionTime: elapsed })
    }

    // POST /rooms/:code/scores/reset
    const resetMatch = url.match(/^\/rooms\/([A-Z0-9-]+)\/scores\/reset$/)
    if (method === 'POST' && resetMatch) {
      const code = resetMatch[1].toUpperCase()
      const { sessionId } = await readBody(req)
      const room = rooms.get(code)
      if (!room) return json(res, 404, { error: 'Room not found' })
      if (room.creatorId !== sessionId) return json(res, 403, { error: 'Only the room creator can reset scores' })
      for (const m of room.members.values()) m.points = 0
      for (const ex of room.exMembers.values()) ex.points = 0
      return json(res, 200, roomView(room))
    }

    json(res, 404, { error: 'Not found' })

  } catch (err) {
    console.error(err)
    json(res, 500, { error: 'Internal server error' })
  }
})

server.listen(PORT, () => console.log(`Buzzin server running on port ${PORT}`))

const ROOM_IDLE_TTL_MS = 30 * 60 * 1000
// Runs once an hour — this app is used by a single group so frequent sweeps aren't needed.
setInterval(() => {
  const cutoff = Date.now() - ROOM_IDLE_TTL_MS
  for (const [code, room] of rooms) {
    if ((room.lastActivityAt ?? room.createdAt) < cutoff) {
      if (room.race?.timer) clearTimeout(room.race.timer)
      rooms.delete(code)
    }
  }
}, 60 * 60 * 1000)
