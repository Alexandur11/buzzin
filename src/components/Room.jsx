import { useState, useEffect, useCallback } from 'react'
import QRCode from 'react-qr-code'
import { SESSION_ID, pollRoom, leaveRoom, kickPlayer, resetScores } from '../store/rooms'
import Leaderboard from './Leaderboard'
import AwardModal from './AwardModal'
import TeamsPanel from './TeamsPanel'
import RacePanel from './RacePanel'
import SettingsPanel from './SettingsPanel'
import HistoryPanel from './HistoryPanel'
import './Room.css'

const POLL_IDLE         = 2500   // between races — no urgency
const POLL_ACTIVE       = 800    // during countdown/active — need low latency
const RECONNECT_BACKOFF = [2500, 3000, 5000, 8000, 15000]

// Copy text to the clipboard. navigator.clipboard only exists in a secure
// context (HTTPS or localhost), so over plain http:// — e.g. an EC2 box served
// on http://<public-ip> — it is undefined. Fall back to a temporary textarea +
// execCommand('copy'), which works in non-secure contexts. Returns success.
async function copyText(text) {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text)
      return true
    }
  } catch { /* fall through to legacy path */ }

  try {
    const ta = document.createElement('textarea')
    ta.value = text
    ta.style.position = 'fixed'
    ta.style.opacity = '0'
    document.body.appendChild(ta)
    ta.focus(); ta.select()
    const ok = document.execCommand('copy')
    document.body.removeChild(ta)
    return ok
  } catch {
    return false
  }
}

// Track the mobile breakpoint (kept in sync with the 640px CSS breakpoint) so we
// can render a single-tab layout on phones and the two-column layout on desktop.
function useIsMobile() {
  const query = '(max-width: 640px)'
  const [isMobile, setIsMobile] = useState(
    typeof window !== 'undefined' && window.matchMedia(query).matches
  )
  useEffect(() => {
    const mq = window.matchMedia(query)
    const onChange = () => setIsMobile(mq.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])
  return isMobile
}

export default function Room({ room: initialRoom, onLeave, onKicked }) {
  const [room, setRoom]           = useState(initialRoom)
  const [copied, setCopied]       = useState(false)
  const [showQR, setShowQR]       = useState(false)
  const [mainTab, setMainTab]     = useState('race')   // desktop main column: 'race' | 'history'
  const [sideTab, setSideTab]     = useState('leaderboard') // desktop sidebar: 'leaderboard' | 'teams' | 'settings'
  const [mobileTab, setMobileTab] = useState('race')   // mobile unified tab: 'race' | 'board' | 'teams' | 'history' | 'settings'
  const [connStatus, setConnStatus] = useState('connected') // 'connected' | 'reconnecting' | 'disconnected'
  const [failCount, setFailCount] = useState(0)
  const [awardedRaceId, setAwardedRaceId] = useState(null) // race whose award popup was dismissed
  const [confirmReset, setConfirmReset]   = useState(false)
  const [resetBusy, setResetBusy]         = useState(false)

  const isCreator = room.creatorId === SESSION_ID
  const myTeam    = room.leaderboard?.find(e => e.sessionId === SESSION_ID)?.team ?? null
  const raceActive = room.race?.status === 'active' || room.race?.status === 'countdown'
  const isMobile  = useIsMobile()

  // Poll with reconnect backoff
  const doPoll = useCallback(async () => {
    try {
      const fresh = await pollRoom(room.code)
      setRoom(fresh)
      setFailCount(0)
      setConnStatus('connected')
      return fresh
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
      const fresh = await doPoll()
      if (cancelled) return
      const raceInProgress = fresh?.race?.status === 'active' || fresh?.race?.status === 'countdown'
      const normalDelay = raceInProgress ? POLL_ACTIVE : POLL_IDLE
      const delay = connStatus === 'connected'
        ? normalDelay
        : RECONNECT_BACKOFF[Math.min(failCount, RECONNECT_BACKOFF.length - 1)]
      timeout = setTimeout(loop, delay)
    }

    loop()
    return () => { cancelled = true; clearTimeout(timeout) }
  }, [doPoll, failCount])

  // iOS Safari (and others) suspend timers in backgrounded tabs, so the poll
  // loop stalls while hidden. Force an immediate refresh the moment the tab
  // becomes visible again so the room state can't be left stale.
  useEffect(() => {
    function onVisible() { if (document.visibilityState === 'visible') doPoll() }
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('pageshow', onVisible)
    return () => {
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('pageshow', onVisible)
    }
  }, [doPoll])

  function handleCopy() {
    copyText(room.code).then(ok => {
      if (ok) { setCopied(true); setTimeout(() => setCopied(false), 2000) }
    })
  }

  async function handleLeave() {
    leaveRoom(room.code); onLeave()
  }

  async function handleKick(targetId) {
    try { await kickPlayer(room.code, targetId) } catch (e) { console.error(e) }
  }

  async function handleReset() {
    setResetBusy(true)
    try { await resetScores(room.code) } catch (e) { console.error(e) }
    finally { setResetBusy(false); setConfirmReset(false) }
  }

  // ── Section content shared between the desktop columns and the mobile tabs ──
  const boardPanel = (
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
      {isCreator && room.leaderboard?.length > 0 && (
        <div className="reset-section">
          {confirmReset ? (
            <>
              <span className="reset-confirm-text">Reset all scores?</span>
              <button className="reset-btn confirm" onClick={handleReset} disabled={resetBusy}>Yes</button>
              <button className="reset-btn cancel" onClick={() => setConfirmReset(false)}>No</button>
            </>
          ) : (
            <button className="reset-btn" onClick={() => setConfirmReset(true)} disabled={resetBusy}>Reset Scores</button>
          )}
        </div>
      )}
    </>
  )
  const teamsPanel    = <TeamsPanel teams={room.teams ?? []} myTeam={myTeam} roomCode={room.code} />
  const settingsPanel = isCreator
    ? <SettingsPanel settings={room.settings} roomCode={room.code} locked={raceActive} />
    : null
  const racePanel = (
    <RacePanel
      race={room.race}
      roomCode={room.code}
      isCreator={isCreator}
      settings={room.settings}
      raceNumber={room.raceNumber}
    />
  )
  const historyPanel = <HistoryPanel history={room.history} />

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
            <button className="copy-btn" onClick={() => setShowQR(true)} title="Show QR code">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/>
                <rect x="5" y="5" width="3" height="3" fill="currentColor" stroke="none"/><rect x="16" y="5" width="3" height="3" fill="currentColor" stroke="none"/><rect x="5" y="16" width="3" height="3" fill="currentColor" stroke="none"/>
                <path d="M14 14h3v3h-3z" fill="currentColor" stroke="none"/><path d="M17 17h4"/><path d="M21 14v3"/>
              </svg>
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
      {isMobile ? (
        /* Mobile: one full-width section at a time, race first */
        <div className="room-mobile">
          <div className="mobile-tabs">
            <button className={`mobile-tab ${mobileTab === 'race' ? 'active' : ''}`} onClick={() => setMobileTab('race')}>Race</button>
            <button className={`mobile-tab ${mobileTab === 'board' ? 'active' : ''}`} onClick={() => setMobileTab('board')}>Board</button>
            <button className={`mobile-tab ${mobileTab === 'teams' ? 'active' : ''}`} onClick={() => setMobileTab('teams')}>Teams</button>
            <button className={`mobile-tab ${mobileTab === 'history' ? 'active' : ''}`} onClick={() => setMobileTab('history')}>
              History {room.history?.length > 0 && <span className="tab-count">{room.history.length}</span>}
            </button>
            {isCreator && <button className={`mobile-tab settings ${mobileTab === 'settings' ? 'active' : ''}`} onClick={() => setMobileTab('settings')}>⚙</button>}
          </div>

          <div className="mobile-panel">
            {mobileTab === 'race'     && racePanel}
            {mobileTab === 'board'    && boardPanel}
            {mobileTab === 'teams'    && teamsPanel}
            {mobileTab === 'history'  && historyPanel}
            {mobileTab === 'settings' && settingsPanel}
          </div>
        </div>
      ) : (
        /* Desktop: standings sidebar alongside the race/main column */
        <div className="room-body">
          <aside className="room-sidebar">
            <div className="side-tabs">
              <button className={`side-tab ${sideTab === 'leaderboard' ? 'active' : ''}`} onClick={() => setSideTab('leaderboard')}>Board</button>
              <button className={`side-tab ${sideTab === 'teams' ? 'active' : ''}`} onClick={() => setSideTab('teams')}>Teams</button>
              {isCreator && <button className={`side-tab ${sideTab === 'settings' ? 'active' : ''}`} onClick={() => setSideTab('settings')}>⚙</button>}
            </div>

            {sideTab === 'leaderboard' && boardPanel}
            {sideTab === 'teams'       && teamsPanel}
            {sideTab === 'settings'    && settingsPanel}
          </aside>

          <main className="room-main">
            <div className="main-tabs">
              <button className={`main-tab ${mainTab === 'race' ? 'active' : ''}`} onClick={() => setMainTab('race')}>Race</button>
              <button className={`main-tab ${mainTab === 'history' ? 'active' : ''}`} onClick={() => setMainTab('history')}>
                History {room.history?.length > 0 && <span className="tab-count">{room.history.length}</span>}
              </button>
            </div>

            {mainTab === 'race'    && racePanel}
            {mainTab === 'history' && historyPanel}
          </main>
        </div>
      )}
      {/* Round-end award popup — host only, shown once per race */}
      {isCreator && room.race?.status === 'closed' && room.race.id !== awardedRaceId && (
        <AwardModal
          key={room.race.id}
          race={room.race}
          entries={room.leaderboard}
          teams={room.teams ?? []}
          roomCode={room.code}
          raceNumber={room.raceNumber}
          onDone={() => setAwardedRaceId(room.race.id)}
        />
      )}

      {showQR && (
        <div className="qr-backdrop" onClick={() => setShowQR(false)}>
          <div className="qr-modal" onClick={e => e.stopPropagation()}>
            <p className="qr-label">SCAN TO JOIN</p>
            <div className="qr-code-wrap">
              <QRCode
                value={`${window.location.origin}?join=${room.code}`}
                size={200}
                bgColor="#ffffff"
                fgColor="#0a0a0a"
              />
            </div>
            <p className="qr-code-text">{room.code}</p>
            <button className="qr-close" onClick={() => setShowQR(false)}>Close</button>
          </div>
        </div>
      )}
    </div>
  )
}
