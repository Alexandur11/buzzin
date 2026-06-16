import { useState, useEffect } from 'react'
import { awardPoints, resetScores } from '../store/rooms'
import './AwardPoints.css'

export default function AwardPoints({ entries, teams, roomCode }) {
  const hasTeams = teams?.length > 0
  const [mode, setMode]           = useState('player')
  const [targetId, setTargetId]   = useState(entries?.[0]?.sessionId ?? '')
  const [targetTeam, setTargetTeam] = useState(teams?.[0]?.name ?? '')
  const [points, setPoints]       = useState('')
  const [busy, setBusy]           = useState(false)
  const [status, setStatus]       = useState(null) // null | 'ok' | 'err'
  const [confirmReset, setConfirmReset] = useState(false)

  useEffect(() => {
    const ids = entries?.map(e => e.sessionId) ?? []
    if (targetId && !ids.includes(targetId)) setTargetId(ids[0] ?? '')
  }, [entries])

  useEffect(() => {
    const names = teams?.map(t => t.name) ?? []
    if (targetTeam && !names.includes(targetTeam)) setTargetTeam(names[0] ?? '')
  }, [teams])

  async function handleReset() {
    setBusy(true)
    try { await resetScores(roomCode) }
    catch {}
    finally { setBusy(false); setConfirmReset(false) }
  }

  async function handleAward() {
    const pts = parseInt(points, 10)
    if (!pts || isNaN(pts) || busy) return
    setBusy(true); setStatus(null)
    try {
      const payload = mode === 'player'
        ? { targetId, points: pts }
        : { targetTeam, points: pts }
      await awardPoints(roomCode, payload)
      setPoints(''); setStatus('ok')
    } catch {
      setStatus('err')
    } finally {
      setBusy(false)
      setTimeout(() => setStatus(null), 2000)
    }
  }

  return (
    <div className="award-panel">
      <p className="award-title">AWARD POINTS</p>

      {hasTeams && (
        <div className="award-mode-row">
          <button className={`award-mode-btn ${mode === 'player' ? 'active' : ''}`} onClick={() => setMode('player')}>Player</button>
          <button className={`award-mode-btn ${mode === 'team' ? 'active' : ''}`} onClick={() => setMode('team')}>Team</button>
        </div>
      )}

      <div className="award-row">
        {mode === 'player' ? (
          <select className="award-select" value={targetId} onChange={e => setTargetId(e.target.value)}>
            {entries?.map(e => (
              <option key={e.sessionId} value={e.sessionId}>{e.username}</option>
            ))}
          </select>
        ) : (
          <select className="award-select" value={targetTeam} onChange={e => setTargetTeam(e.target.value)}>
            {teams?.map(t => (
              <option key={t.name} value={t.name}>{t.name}</option>
            ))}
          </select>
        )}

        <input
          className="award-pts-input"
          type="number"
          placeholder="pts"
          value={points}
          onChange={e => setPoints(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleAward()}
        />

        <button
          className={`award-btn ${status === 'ok' ? 'ok' : status === 'err' ? 'err' : ''}`}
          onClick={handleAward}
          disabled={busy || !points}
        >
          {status === 'ok' ? '✓' : status === 'err' ? '!' : busy ? '…' : 'Give'}
        </button>
      </div>

      <p className="award-hint">Use negative values to deduct points.</p>

      <div className="award-reset-row">
        {confirmReset ? (
          <>
            <span className="award-reset-confirm">Reset all scores?</span>
            <button className="award-reset-btn confirm" onClick={handleReset} disabled={busy}>Yes</button>
            <button className="award-reset-btn cancel" onClick={() => setConfirmReset(false)}>No</button>
          </>
        ) : (
          <button className="award-reset-btn" onClick={() => setConfirmReset(true)} disabled={busy}>
            Reset Scores
          </button>
        )}
      </div>
    </div>
  )
}
