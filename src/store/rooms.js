function getSessionId() {
  let id = localStorage.getItem('buzzin_sid')
  if (!id) { id = Math.random().toString(36).slice(2, 10); localStorage.setItem('buzzin_sid', id) }
  return id
}

export const SESSION_ID = getSessionId()

export function saveLastSession(code, username) {
  localStorage.setItem('buzzin_room', code)
  localStorage.setItem('buzzin_username', username)
}
export function clearLastSession() {
  localStorage.removeItem('buzzin_room')
  localStorage.removeItem('buzzin_username')
}
export function getLastSession() {
  const code     = localStorage.getItem('buzzin_room')
  const username = localStorage.getItem('buzzin_username')
  return code && username ? { code, username } : null
}

// Default to the same-origin "/api" path, which both the Vite dev server and the
// production nginx config proxy to the backend on :4000. Using a relative path
// (instead of an absolute http://localhost:4000) means the API is reached via
// whatever host loaded the page — so other devices on the LAN, or a deployed
// box, work without baking in a machine-specific address. Override with
// VITE_API_URL only if the backend lives on a different origin.
const API = import.meta.env.VITE_API_URL || '/api'

async function post(path, body = {}) {
  const res = await fetch(`${API}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionId: SESSION_ID, ...body }),
  })
  const data = await res.json()
  if (!res.ok) throw Object.assign(new Error(data.error || 'Request failed'), { code: data.error })
  return data
}

async function get(path) {
  const res = await fetch(`${API}${path}`, { headers: { 'x-session-id': SESSION_ID } })
  const data = await res.json()
  if (!res.ok) throw Object.assign(new Error(data.error || 'Request failed'), { code: data.error })
  return data
}

export async function createRoom(username) {
  const room = await post('/rooms', { username })
  saveLastSession(room.code, username)
  return room
}
export async function joinRoom(code, username) {
  const room = await post(`/rooms/${code.toUpperCase().replace(/\s/g,'')}/join`, { username })
  saveLastSession(room.code, username)
  return room
}
export const pollRoom    = (code)                => get(`/rooms/${code}`)

export function leaveRoom(code) {
  const url = `${API}/rooms/${code}/leave`
  const payload = JSON.stringify({ sessionId: SESSION_ID })
  if (navigator.sendBeacon) navigator.sendBeacon(url, new Blob([payload], { type: 'application/json' }))
  else fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: payload, keepalive: true })
}

export const createTeam  = (code, teamName)      => post(`/rooms/${code}/teams/create`, { teamName })
export const joinTeam    = (code, teamName)       => post(`/rooms/${code}/teams/join`, { teamName })
export const leaveTeam   = (code)                 => post(`/rooms/${code}/teams/leave`)

export const kickPlayer  = (code, targetId)      => post(`/rooms/${code}/kick`, { targetId })

export const startRace   = (code)                 => post(`/rooms/${code}/race/start`)
export const stopRace    = (code)                 => post(`/rooms/${code}/race/stop`)
export const submitReaction = (code)              => post(`/rooms/${code}/race/submit`)

export const updateSettings = (code, settings) => post(`/rooms/${code}/settings`, settings)
export const awardPoints   = (code, payload)  => post(`/rooms/${code}/award`, payload)
export const resetScores = (code) => post(`/rooms/${code}/scores/reset`)
