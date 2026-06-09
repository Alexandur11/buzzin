import { useState, useEffect, useRef } from 'react'
import { SESSION_ID, startRace, stopRace, submitReaction } from '../store/rooms'
import './RacePanel.css'

const RACE_DURATION = 10_000

export default function RacePanel({ race, roomCode, isCreator }) {
  const [timeLeft, setTimeLeft]     = useState(null)
  const [submitted, setSubmitted]   = useState(false)
  const [myReaction, setMyReaction] = useState(null)
  const [latePress, setLatePress]   = useState(false)
  const [busy, setBusy]             = useState(false)
  const submittedRaceRef            = useRef(null)

  // Sync submitted state from server (survives page refresh)
  useEffect(() => {
    if (!race) return
    const own = race.results?.find(r => r.sessionId === SESSION_ID && !r.noResponse)
    if (own) {
      setSubmitted(true); setMyReaction(own.reactionTime)
      submittedRaceRef.current = race.id
    } else if (race.id !== submittedRaceRef.current) {
      setSubmitted(false); setMyReaction(null); setLatePress(false)
    }
  }, [race?.id])

  // Countdown ticker
  useEffect(() => {
    if (!race || race.status !== 'active') { setTimeLeft(null); return }
    const tick = () => setTimeLeft(Math.max(0, RACE_DURATION - (Date.now() - race.startTime)))
    tick()
    const id = setInterval(tick, 50)
    return () => clearInterval(id)
  }, [race?.id, race?.status])

  async function handleStart() {
    setBusy(true)
    try { await startRace(roomCode) } catch (e) { console.error(e) } finally { setBusy(false) }
  }

  async function handleStop() {
    setBusy(true)
    try { await stopRace(roomCode) } catch (e) { console.error(e) } finally { setBusy(false) }
  }

  async function handleBuzz() {
    if (submitted || race?.status !== 'active') { setLatePress(true); return }
    if (Date.now() - race.startTime > RACE_DURATION) { setLatePress(true); return }
    try {
      const res = await submitReaction(roomCode)
      setMyReaction(res.reactionTime); setSubmitted(true)
      submittedRaceRef.current = race?.id
    } catch (err) {
      if (err.code === 'time_up' || err.code === 'already_submitted') {
        setLatePress(true); setSubmitted(true)
      }
    }
  }

  const isActive  = race?.status === 'active'
  const isClosed  = race?.status === 'closed'
  const pct       = timeLeft != null ? (timeLeft / RACE_DURATION) * 100 : 0
  const isUrgent  = timeLeft != null && timeLeft < 3000
  const responded = race?.results?.filter(r => !r.noResponse) ?? []
  const noResp    = race?.results?.filter(r => r.noResponse)  ?? []

  return (
    <div className="race-panel">

      {/* ── Top bar: status + creator controls ── */}
      <div className="race-topbar">
        <div className="race-status-area">
          {!race && (
            <span className="race-status-chip waiting">
              {isCreator ? 'Ready to start' : 'Waiting for host…'}
            </span>
          )}
          {isActive && timeLeft != null && (
            <>
              <span className={`race-countdown ${isUrgent ? 'urgent' : ''}`}>
                {(timeLeft / 1000).toFixed(1)}
                <span className="race-countdown-unit">s</span>
              </span>
              <div className="timer-track">
                <div className={`timer-fill ${isUrgent ? 'urgent' : ''}`} style={{ width: `${pct}%` }} />
              </div>
            </>
          )}
          {isClosed && <span className="race-status-chip closed">RACE FINISHED</span>}
        </div>

        {isCreator && (
          <div className="race-controls">
            {(!race || isClosed) && (
              <button className="btn-race-start" onClick={handleStart} disabled={busy}>
                {busy ? '…' : isClosed ? 'New Race' : 'Start Race'}
              </button>
            )}
            {isActive && (
              <button className="btn-race-stop" onClick={handleStop} disabled={busy}>
                {busy ? '…' : 'Stop Race'}
              </button>
            )}
          </div>
        )}
      </div>

      {/* ── BUZZ button ── */}
      <div className="buzz-area">
        {!isCreator && isActive && !submitted && !latePress && (
          <button className="buzz-btn" onClick={handleBuzz}>BUZZ!</button>
        )}
        {!isCreator && !race && (
          <div className="buzz-btn inactive">BUZZ!</div>
        )}
        {!isCreator && isClosed && (
          <div className="buzz-btn closed-state">RACE OVER</div>
        )}
        {isCreator && (
          <div className={`buzz-btn creator-view ${isActive ? 'active-state' : ''}`}>
            {isActive ? `${responded.length} / ${responded.length + noResp.length} responded` : 'HOST'}
          </div>
        )}
        {!isCreator && submitted && myReaction != null && !latePress && (
          <div className="my-reaction-badge">
            <span className="mr-label">YOUR TIME</span>
            <span className="mr-time">{(myReaction / 1000).toFixed(3)}s</span>
          </div>
        )}
        {!isCreator && latePress && (
          <p className="late-msg">Time is up. Submissions are closed.</p>
        )}
        {!isCreator && submitted && !latePress && isActive && (
          <p className="waiting-msg">Waiting for others…</p>
        )}
      </div>

      {/* ── Results table ── */}
      {(responded.length > 0 || (isClosed && noResp.length > 0)) && (
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
                  <td className="rt-td">
                    {r.username}
                    {r.sessionId === SESSION_ID && <span className="tag-you"> you</span>}
                  </td>
                  <td className="rt-td team">
                    {r.team ? <span className="team-chip">{r.team}</span> : <span className="solo-chip">Solo</span>}
                  </td>
                  <td className="rt-td right">{(r.reactionTime / 1000).toFixed(3)}s</td>
                </tr>
              ))}
              {isClosed && noResp.map(r => (
                <tr key={r.sessionId} className="rt-row no-resp-row">
                  <td className="rt-td pos">—</td>
                  <td className="rt-td">
                    {r.username}
                    {r.sessionId === SESSION_ID && <span className="tag-you"> you</span>}
                  </td>
                  <td className="rt-td team">
                    {r.team ? <span className="team-chip muted">{r.team}</span> : <span className="solo-chip">Solo</span>}
                  </td>
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
