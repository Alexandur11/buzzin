function getSessionId() {
  let id = sessionStorage.getItem('buzzin_sid')
  if (!id) { id = Math.random().toString(36).slice(2, 10); sessionStorage.setItem('buzzin_sid', id) }
  return id
}

export const SESSION_ID = getSessionId()

const API = import.meta.env.VITE_API_URL || 'http://localhost:4000'

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
  const res = await fetch(`${API}${path}`)
  const data = await res.json()
  if (!res.ok) throw new Error(data.error || 'Request failed')
  return data
}

export const createRoom  = (username)           => post('/rooms', { username })
export const joinRoom    = (code, username)      => post(`/rooms/${code.toUpperCase().replace(/\s/g,'')}/join`, { username })
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
