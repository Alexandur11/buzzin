import { useState, useEffect, useCallback } from 'react'
import { SESSION_ID, pollRoom, leaveRoom, kickPlayer } from '../store/rooms'
import Leaderboard from './Leaderboard'
import TeamsPanel from './TeamsPanel'
import RacePanel from './RacePanel'
import SettingsPanel from './SettingsPanel'
import HistoryPanel from './HistoryPanel'
import './Room.css'

const POLL_IDLE         = 2500   // between races — no urgency
const POLL_ACTIVE       = 800    // during countdown/active — need low latency
const RECONNECT_BACKOFF = [2500, 3000, 5000, 8000, 15000]

export default function Room({ room: initialRoom, onLeave, onKicked }) {
  const [room, setRoom]           = useState(initialRoom)
  const [copied, setCopied]       = useState(false)
  const [mainTab, setMainTab]     = useState('race')   // 'race' | 'history'
  const [sideTab, setSideTab]     = useState('leaderboard') // 'leaderboard' | 'teams' | 'settings'
  const [connStatus, setConnStatus] = useState('connected') // 'connected' | 'reconnecting' | 'disconnected'
  const [failCount, setFailCount] = useState(0)

  const isCreator = room.creatorId === SESSION_ID
  const myTeam    = room.leaderboard?.find(e => e.sessionId === SESSION_ID)?.team ?? null
  const raceActive = room.race?.status === 'active' || room.race?.status === 'countdown'

  // Poll with reconnect backoff
  const doPoll = useCallback(async () => {
    try {
      const fresh = await pollRoom(room.code)
      setRoom(fresh)
      setFailCount(0)
      setConnStatus('connected')
    } catch (err) {
      if (err.code === 'kicked') { onKicked(); return }
      if (err.message === 'Room not found') { onLeave(); return }
      setFailCount(n => n + 1)
      setConnStatus(n => n >= RECONNECT_BACKOFF.length - 1 ? 'disconnected' : 'reconnecting')
    }
  }, [room.code])

  useEffect(() => {
    let timeout
    let cancelled = false

    async function loop() {
      if (cancelled) return
      await doPoll()
      if (cancelled) return
      const raceInProgress = room.race?.status === 'active' || room.race?.status === 'countdown'
      const normalDelay = raceInProgress ? POLL_ACTIVE : POLL_IDLE
      const delay = connStatus === 'connected'
        ? normalDelay
        : RECONNECT_BACKOFF[Math.min(failCount, RECONNECT_BACKOFF.length - 1)]
      timeout = setTimeout(loop, delay)
    }

    loop()
    return () => { cancelled = true; clearTimeout(timeout) }
  }, [doPoll, failCount])

  function handleCopy() {
    navigator.clipboard.writeText(room.code).then(() => {
      setCopied(true); setTimeout(() => setCopied(false), 2000)
    })
  }

  async function handleLeave() {
    leaveRoom(room.code); onLeave()
  }

  async function handleKick(targetId) {
    try { await kickPlayer(room.code, targetId) } catch (e) { console.error(e) }
  }

  return (
    <div className="room-layout">

      {/* ── Reconnect banner ── */}
      {connStatus !== 'connected' && (
        <div className={`conn-banner ${connStatus}`}>
          {connStatus === 'reconnecting' ? '⟳ Reconnecting…' : '✕ Connection lost. Retrying…'}
        </div>
      )}

      {/* ── Top bar ── */}
      <div className="room-topbar">
        <div className="room-topbar-left">
          <span className="rtb-label">ROOM CODE</span>
          <div className="rtb-code-row">
            <span className="rtb-code">{room.code}</span>
            <button className={`copy-btn ${copied ? 'copied' : ''}`} onClick={handleCopy} title="Copy code">
              {copied
                ? <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
                : <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></svg>
              }
            </button>
          </div>
          {room.settings?.maxRounds > 0 && (
            <span className="rounds-progress">
              Race {room.raceNumber} / {room.settings.maxRounds}
            </span>
          )}
        </div>
        <div className="room-topbar-right">
          {isCreator && <span className="host-badge">HOST</span>}
          <span className="member-count">{room.memberCount} online</span>
          <button className="btn-leave" onClick={handleLeave}>Leave</button>
        </div>
      </div>

      {/* ── Body ── */}
      <div className="room-body">

        {/* Sidebar */}
        <aside className="room-sidebar">
          <div className="side-tabs">
            <button className={`side-tab ${sideTab === 'leaderboard' ? 'active' : ''}`} onClick={() => setSideTab('leaderboard')}>Board</button>
            <button className={`side-tab ${sideTab === 'teams' ? 'active' : ''}`} onClick={() => setSideTab('teams')}>Teams</button>
            {isCreator && <button className={`side-tab ${sideTab === 'settings' ? 'active' : ''}`} onClick={() => setSideTab('settings')}>⚙</button>}
          </div>

          {sideTab === 'leaderboard' && (
            <>
              <Leaderboard entries={room.leaderboard} />
              {isCreator && room.leaderboard?.filter(e => e.sessionId !== SESSION_ID).length > 0 && (
                <div className="kick-section">
                  <p className="kick-label">KICK PLAYER</p>
                  {room.leaderboard.filter(e => e.sessionId !== SESSION_ID).map(e => (
                    <div key={e.sessionId} className="kick-row">
                      <span className="kick-name">{e.username}</span>
                      <button className="kick-btn" onClick={() => handleKick(e.sessionId)}>Kick</button>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}

          {sideTab === 'teams' && (
            <TeamsPanel teams={room.teams ?? []} myTeam={myTeam} roomCode={room.code} />
          )}

          {sideTab === 'settings' && isCreator && (
            <SettingsPanel
              settings={room.settings}
              roomCode={room.code}
              locked={raceActive}
            />
          )}
        </aside>

        {/* Main */}
        <main className="room-main">
          <div className="main-tabs">
            <button className={`main-tab ${mainTab === 'race' ? 'active' : ''}`} onClick={() => setMainTab('race')}>Race</button>
            <button className={`main-tab ${mainTab === 'history' ? 'active' : ''}`} onClick={() => setMainTab('history')}>
              History {room.history?.length > 0 && <span className="tab-count">{room.history.length}</span>}
            </button>
          </div>

          {mainTab === 'race' && (
            <RacePanel
              race={room.race}
              roomCode={room.code}
              isCreator={isCreator}
              settings={room.settings}
              raceNumber={room.raceNumber}
            />
          )}

          {mainTab === 'history' && (
            <HistoryPanel history={room.history} />
          )}
        </main>

      </div>
    </div>
  )
}
