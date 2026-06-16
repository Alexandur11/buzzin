import { useState, useEffect, useRef } from 'react'
import { SESSION_ID, startRace, stopRace, submitReaction } from '../store/rooms'
import './RacePanel.css'

export default function RacePanel({ race, roomCode, isCreator, settings, raceNumber }) {
  const raceDuration        = settings?.raceDurationMs ?? 10_000
  const [timeLeft, setTimeLeft]       = useState(null)
  const [cdLeft, setCdLeft]           = useState(null)   // countdown seconds remaining
  const [submitted, setSubmitted]     = useState(false)
  const [myReaction, setMyReaction]   = useState(null)
  const [earlyClick, setEarlyClick]   = useState(false)
  const [latePress, setLatePress]     = useState(false)
  const [busy, setBusy]               = useState(false)
  const submittedRaceRef              = useRef(null)

  // Sync submitted/early state from server (survives page refresh)
  useEffect(() => {
    if (!race) return
    const own = race.results?.find(r => r.sessionId === SESSION_ID)
    if (own && !own.noResponse) {
      if (own.earlyClick) {
        setEarlyClick(true); setSubmitted(true)
      } else {
        setSubmitted(true); setMyReaction(own.reactionTime)
      }
      submittedRaceRef.current = race.id
    } else if (race.id !== submittedRaceRef.current) {
      setSubmitted(false); setMyReaction(null); setEarlyClick(false); setLatePress(false)
    }
  }, [race?.id])

  // Countdown ticker
  useEffect(() => {
    if (!race || race.status === 'closed') { setCdLeft(null); return }
    if (race.status !== 'countdown') { setCdLeft(null); return }
    const tick = () => {
      const left = Math.max(0, race.countdownEnd - Date.now())
      setCdLeft(left)
    }
    tick(); const id = setInterval(tick, 50); return () => clearInterval(id)
  }, [race?.id, race?.status, race?.countdownEnd])

  // Race timer ticker
  useEffect(() => {
    if (!race || race.status !== 'active') { setTimeLeft(null); return }
    const tick = () => setTimeLeft(Math.max(0, raceDuration - (Date.now() - race.startTime)))
    tick(); const id = setInterval(tick, 50); return () => clearInterval(id)
  }, [race?.id, race?.status, race?.startTime, raceDuration])

  async function handleStart() {
    setBusy(true)
    try { await startRace(roomCode) } catch (e) { console.error(e) } finally { setBusy(false) }
  }

  async function handleStop() {
    setBusy(true)
    try { await stopRace(roomCode) } catch (e) { console.error(e) } finally { setBusy(false) }
  }

  async function handleBuzz() {
    if (submitted) return
    if (!race || race.status === 'closed') { setLatePress(true); return }

    try {
      const res = await submitReaction(roomCode)
      setMyReaction(res.reactionTime); setSubmitted(true)
      submittedRaceRef.current = race?.id
    } catch (err) {
      if (err.code === 'early_click')        { setEarlyClick(true); setSubmitted(true) }
      else if (err.code === 'time_up')       { setLatePress(true); setSubmitted(true) }
      else if (err.code === 'already_submitted') { setSubmitted(true) }
    }
  }

  const isCountdown = race?.status === 'countdown'
  const isActive    = race?.status === 'active'
  const isClosed    = race?.status === 'closed'
  const pct         = timeLeft != null ? (timeLeft / raceDuration) * 100 : 0
  const isUrgent    = timeLeft != null && timeLeft < 3000
  const responded   = race?.results?.filter(r => !r.noResponse && !r.earlyClick) ?? []
  const earlyList   = race?.results?.filter(r => r.earlyClick)  ?? []
  const noResp      = race?.results?.filter(r => r.noResponse)  ?? []

  // Countdown display: ceil to whole seconds, but show 0 when fakeout is happening
  const cdSecs = cdLeft != null ? Math.ceil(cdLeft / 1000) : null

  return (
    <div className="race-panel">

      {/* ── Top bar ── */}
      <div className="race-topbar">
        <div className="race-status-area">
          {!race && <span className="race-status-chip waiting">{isCreator ? 'Ready to start' : 'Waiting for host…'}</span>}
          {isCountdown && cdSecs != null && (
            <div className="cd-display">
              <span className="cd-label">GET READY</span>
              <span className="cd-number">{cdSecs > 0 ? cdSecs : '…'}</span>
            </div>
          )}
          {isActive && timeLeft != null && (
            <>
              <span className={`race-countdown ${isUrgent ? 'urgent' : ''}`}>
                {(timeLeft / 1000).toFixed(1)}<span className="race-countdown-unit">s</span>
              </span>
              <div className="timer-track">
                <div className={`timer-fill ${isUrgent ? 'urgent' : ''}`} style={{ width: `${pct}%` }} />
              </div>
            </>
          )}
          {isClosed && <span className="race-status-chip closed">RACE FINISHED</span>}
          {raceNumber > 0 && <span className="race-number-badge">Race #{raceNumber}</span>}
        </div>

        {isCreator && (
          <div className="race-controls">
            {(!race || isClosed) && (
              <button className="btn-race-start" onClick={handleStart} disabled={busy}>
                {busy ? '…' : isClosed ? 'New Race' : 'Start Race'}
              </button>
            )}
            {(isActive || isCountdown) && (
              <>
                {isActive && <span className="responded-count">{responded.length} responded</span>}
                <button className="btn-race-stop" onClick={handleStop} disabled={busy}>
                  {busy ? '…' : 'Stop Race'}
                </button>
              </>
            )}
          </div>
        )}
      </div>

      {/* ── Buzz button area ── */}
      <div className="buzz-area">
        {/* Countdown phase */}
        {isCountdown && !submitted && (
          <button className="buzz-btn countdown-phase" onClick={handleBuzz}>
            {cdSecs != null && cdSecs > 0 ? cdSecs : '…'}
          </button>
        )}

        {/* Active phase */}
        {isActive && !submitted && !latePress && (
          <button className="buzz-btn active-phase" onClick={handleBuzz}>BUZZ!</button>
        )}

        {/* Idle */}
        {!race && <div className="buzz-btn inactive">BUZZ!</div>}

        {/* Closed */}
        {isClosed && !submitted && <div className="buzz-btn closed-state">RACE OVER</div>}

        {/* Feedback */}
        {submitted && myReaction != null && !earlyClick && !latePress && (
          <div className="my-reaction-badge">
            <span className="mr-label">YOUR TIME</span>
            <span className="mr-time">{(myReaction / 1000).toFixed(3)}s</span>
          </div>
        )}
        {earlyClick && (
          <div className="race-feedback early">
            ⚡ Too early! You clicked before the race started.
          </div>
        )}
        {latePress && (
          <div className="race-feedback late">Time is up. Submissions are closed.</div>
        )}
        {submitted && myReaction != null && !earlyClick && isActive && (
          <p className="waiting-msg">Waiting for others…</p>
        )}
      </div>

      {/* ── Results table ── */}
      {(responded.length > 0 || earlyList.length > 0 || (isClosed && noResp.length > 0)) && (
        <div className="results-section">
          <p className="results-label">{isActive ? 'LIVE RESULTS' : 'FINAL RESULTS'}</p>
          <table className="results-table">
            <thead>
              <tr>
                <th className="rt-th pos">#</th>
                <th className="rt-th">Username</th>
                <th className="rt-th">Team</th>
                <th className="rt-th right">Time</th>
              </tr>
            </thead>
            <tbody>
              {responded.map((r, idx) => (
                <tr key={r.sessionId} className={`rt-row ${r.sessionId === SESSION_ID ? 'rt-self' : ''}`}>
                  <td className="rt-td pos">{idx + 1}</td>
                  <td className="rt-td">{r.username}{r.sessionId === SESSION_ID && <span className="tag-you"> you</span>}</td>
                  <td className="rt-td team">{r.team ? <span className="team-chip">{r.team}</span> : <span className="solo-chip">Solo</span>}</td>
                  <td className="rt-td right">{(r.reactionTime / 1000).toFixed(3)}s</td>
                </tr>
              ))}
              {earlyList.map(r => (
                <tr key={r.sessionId} className={`rt-row early-row ${r.sessionId === SESSION_ID ? 'rt-self' : ''}`}>
                  <td className="rt-td pos">⚡</td>
                  <td className="rt-td">{r.username}{r.sessionId === SESSION_ID && <span className="tag-you"> you</span>}</td>
                  <td className="rt-td team">{r.team ? <span className="team-chip muted">{r.team}</span> : <span className="solo-chip">Solo</span>}</td>
                  <td className="rt-td right early-label">Early</td>
                </tr>
              ))}
              {isClosed && noResp.map(r => (
                <tr key={r.sessionId} className="rt-row no-resp-row">
                  <td className="rt-td pos">—</td>
                  <td className="rt-td">{r.username}{r.sessionId === SESSION_ID && <span className="tag-you"> you</span>}</td>
                  <td className="rt-td team">{r.team ? <span className="team-chip muted">{r.team}</span> : <span className="solo-chip">Solo</span>}</td>
                  <td className="rt-td right no-resp">No Response</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Team summary ── */}
      {(isClosed || responded.length > 0) && race?.teamSummary?.length > 0 && (
        <div className="team-summary-section">
          <p className="results-label">TEAM SUMMARY</p>
          <table className="results-table">
            <thead>
              <tr>
                <th className="rt-th">Team</th>
                <th className="rt-th">First Click</th>
                <th className="rt-th right">Time</th>
              </tr>
            </thead>
            <tbody>
              {race.teamSummary.map((ts, idx) => (
                <tr key={ts.team} className={`rt-row ${idx === 0 ? 'ts-winner' : ''}`}>
                  <td className="rt-td"><span className="team-chip">{ts.team}</span></td>
                  <td className="rt-td">{ts.username}</td>
                  <td className="rt-td right">{(ts.reactionTime / 1000).toFixed(3)}s</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
