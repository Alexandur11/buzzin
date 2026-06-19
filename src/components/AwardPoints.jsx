import { useState, useEffect } from 'react'
import { awardPoints, resetScores } from '../store/rooms'
import './AwardPoints.css'

// Quick-tap amounts — covers almost every award without typing.
const QUICK = [-1, 1, 2, 3, 5, 10]

export default function AwardPoints({ entries, teams, roomCode }) {
  const hasTeams = teams?.length > 0
  const [mode, setMode]             = useState('player')
  const [targetId, setTargetId]     = useState(entries?.[0]?.sessionId ?? '')
  const [targetTeam, setTargetTeam] = useState(teams?.[0]?.name ?? '')
  const [custom, setCustom]         = useState('')
  const [busy, setBusy]             = useState(false)
  const [feedback, setFeedback]     = useState(null) // null | { type: 'ok' | 'err', text }
  const [confirmReset, setConfirmReset] = useState(false)

  useEffect(() => {
    const ids = entries?.map(e => e.sessionId) ?? []
    if (targetId && !ids.includes(targetId)) setTargetId(ids[0] ?? '')
  }, [entries])

  useEffect(() => {
    const names = teams?.map(t => t.name) ?? []
    if (targetTeam && !names.includes(targetTeam)) setTargetTeam(names[0] ?? '')
  }, [teams])

  const hasTarget  = mode === 'player' ? !!targetId : !!targetTeam
  const targetName = mode === 'player'
    ? (entries?.find(e => e.sessionId === targetId)?.username ?? '')
    : targetTeam

  async function handleReset() {
    setBusy(true)
    try { await resetScores(roomCode) }
    catch {}
    finally { setBusy(false); setConfirmReset(false) }
  }

  async function handleAward(pts) {
    if (!pts || isNaN(pts) || busy || !hasTarget) return
    setBusy(true); setFeedback(null)
    try {
      const payload = mode === 'player'
        ? { targetId, points: pts }
        : { targetTeam, points: pts }
      await awardPoints(roomCode, payload)
      setCustom('')
      setFeedback({ type: 'ok', text: `${pts > 0 ? '+' : ''}${pts} → ${targetName}` })
    } catch {
      setFeedback({ type: 'err', text: 'Failed — try again' })
    } finally {
      setBusy(false)
      setTimeout(() => setFeedback(null), 2200)
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

      {/* Pick who gets the points */}
      <div className="award-target-row">
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
      </div>

      {/* Tap to award instantly */}
      <div className="award-quick">
        {QUICK.map(n => (
          <button
            key={n}
            className={`award-chip ${n < 0 ? 'minus' : 'plus'}`}
            onClick={() => handleAward(n)}
            disabled={busy || !hasTarget}
          >
            {n > 0 ? `+${n}` : n}
          </button>
        ))}
      </div>

      {/* Custom amount */}
      <div className="award-custom">
        <input
          className="award-pts-input"
          type="number"
          inputMode="numeric"
          placeholder="Custom"
          value={custom}
          onChange={e => setCustom(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleAward(parseInt(custom, 10))}
        />
        <button
          className="award-btn"
          onClick={() => handleAward(parseInt(custom, 10))}
          disabled={busy || !custom || !hasTarget}
        >
          {busy ? '…' : 'Give'}
        </button>
      </div>

      {feedback
        ? <p className={`award-feedback ${feedback.type}`}>{feedback.type === 'ok' ? '✓ ' : ''}{feedback.text}</p>
        : <p className="award-hint">Tap a chip to award instantly. Minus deducts.</p>}

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
