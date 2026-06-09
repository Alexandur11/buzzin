import { useState, useEffect } from 'react'
import { SESSION_ID, pollRoom, leaveRoom } from '../store/rooms'
import Leaderboard from './Leaderboard'
import TeamsPanel from './TeamsPanel'
import RacePanel from './RacePanel'
import './Room.css'

const POLL_INTERVAL = 1500

export default function Room({ room: initialRoom, onLeave }) {
  const [room, setRoom] = useState(initialRoom)
  const [copied, setCopied] = useState(false)

  const isCreator = room.creatorId === SESSION_ID
  const myTeam    = room.leaderboard?.find(e => e.sessionId === SESSION_ID)?.team ?? null

  useEffect(() => {
    let cancelled = false
    async function poll() {
      try {
        const fresh = await pollRoom(room.code)
        if (!cancelled) setRoom(fresh)
      } catch { /* server gone */ }
    }
    poll()
    const id = setInterval(poll, POLL_INTERVAL)
    return () => { cancelled = true; clearInterval(id) }
  }, [room.code])

  function handleCopy() {
    navigator.clipboard.writeText(room.code).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  async function handleLeave() {
    await leaveRoom(room.code)
    onLeave()
  }

  return (
    <div className="room-layout">

      {/* ── Room top bar ── */}
      <div className="room-topbar">
        <div className="room-topbar-left">
          <span className="rtb-label">ROOM CODE</span>
          <div className="rtb-code-row">
            <span className="rtb-code">{room.code}</span>
            <button className={`copy-btn ${copied ? 'copied' : ''}`} onClick={handleCopy} title="Copy code">
              {copied ? (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              ) : (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                  <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                </svg>
              )}
            </button>
          </div>
        </div>

        <div className="room-topbar-right">
          {isCreator && <span className="host-badge">HOST</span>}
          <span className="member-count">{room.memberCount} online</span>
          <button className="btn-leave" onClick={handleLeave}>Leave</button>
        </div>
      </div>

      {/* ── Body: sidebar + main ── */}
      <div className="room-body">

        {/* Left sidebar */}
        <aside className="room-sidebar">
          <Leaderboard entries={room.leaderboard} />
          <div className="sidebar-divider" />
          <TeamsPanel
            teams={room.teams ?? []}
            myTeam={myTeam}
            roomCode={room.code}
          />
        </aside>

        {/* Main content */}
        <main className="room-main">
          <RacePanel
            race={room.race}
            roomCode={room.code}
            isCreator={isCreator}
          />
        </main>

      </div>
    </div>
  )
}
