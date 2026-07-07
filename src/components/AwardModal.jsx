import { useState } from 'react'
import { awardPoints } from '../store/rooms'
import './AwardModal.css'

// Quick-tap amounts — covers almost every award without typing.
const QUICK = [-1, 1, 2, 3, 5, 10]

// Round-end popup (host only). Shown once a race closes so the host can hand out
// points for that round, then dismiss to ready the next race. Unlike the old
// always-on panel, awards here can be made to several targets in a row; each one
// applies live and is logged, and "Done" closes the popup.
export default function AwardModal({ race, entries, teams, roomCode, raceNumber, onDone }) {
  const responded = race?.results?.filter(r => !r.noResponse && !r.earlyClick) ?? []
  const winner    = responded[0] ?? null
  const hasTeams  = teams?.length > 0

  const [mode, setMode]             = useState('player')
  // Pre-select the round's winner (player mode) / winning team (team mode).
  const [targetId, setTargetId]     = useState(winner?.sessionId ?? entries?.[0]?.sessionId ?? '')
  const [targetTeam, setTargetTeam] = useState(race?.teamSummary?.[0]?.team ?? teams?.[0]?.name ?? '')
  const [custom, setCustom]         = useState('')
  const [busy, setBusy]             = useState(false)
  const [error, setError]           = useState('')
  const [log, setLog]               = useState([]) // awards granted this round: [{ id, text }]

  const hasTarget  = mode === 'player' ? !!targetId : !!targetTeam
  const targetName = mode === 'player'
    ? (entries?.find(e => e.sessionId === targetId)?.username ?? '')
    : targetTeam

  async function handleAward(pts) {
    if (!pts || isNaN(pts) || busy || !hasTarget) return
    setBusy(true); setError('')
    try {
      const payload = mode === 'player' ? { targetId, points: pts } : { targetTeam, points: pts }
      await awardPoints(roomCode, payload)
      setCustom('')
      setLog(l => [{ id: Date.now() + Math.random(), text: `${pts > 0 ? '+' : ''}${pts} → ${targetName}` }, ...l].slice(0, 6))
    } catch {
      setError('Failed — try again')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="award-modal-backdrop">
      <div className="award-modal">
        <p className="am-eyebrow">RACE #{raceNumber} FINISHED</p>
        <p className="am-title">Award points</p>

        {winner ? (
          <div className="am-winner">
            <span className="am-winner-medal">🥇</span>
            <span className="am-winner-name">{winner.username}</span>
            <span className="am-winner-time">{(winner.reactionTime / 1000).toFixed(3)}s</span>
          </div>
        ) : (
          <p className="am-noresults">No one buzzed in this round.</p>
        )}

        {hasTeams && (
          <div className="award-mode-row">
            <button className={`award-mode-btn ${mode === 'player' ? 'active' : ''}`} onClick={() => setMode('player')}>Player</button>
            <button className={`award-mode-btn ${mode === 'team' ? 'active' : ''}`} onClick={() => setMode('team')}>Team</button>
          </div>
        )}

        {/* Who gets the points */}
        <div className="award-target-row">
          {mode === 'player' ? (
            <select className="award-select" value={targetId} onChange={e => setTargetId(e.target.value)}>
              {entries?.map(e => <option key={e.sessionId} value={e.sessionId}>{e.username}</option>)}
            </select>
          ) : (
            <select className="award-select" value={targetTeam} onChange={e => setTargetTeam(e.target.value)}>
              {teams?.map(t => <option key={t.name} value={t.name}>{t.name}</option>)}
            </select>
          )}
        </div>

        {/* Tap to award instantly (stays open for more) */}
        <div className="award-quick">
          {QUICK.map(n => (
            <button key={n} className={`award-chip ${n < 0 ? 'minus' : 'plus'}`} onClick={() => handleAward(n)} disabled={busy || !hasTarget}>
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
          <button className="award-btn" onClick={() => handleAward(parseInt(custom, 10))} disabled={busy || !custom || !hasTarget}>
            {busy ? '…' : 'Give'}
          </button>
        </div>

        {error && <p className="award-feedback err">{error}</p>}

        {log.length > 0 && (
          <div className="am-log">
            <p className="am-log-label">AWARDED THIS ROUND</p>
            {log.map(entry => <p key={entry.id} className="am-log-item">✓ {entry.text}</p>)}
          </div>
        )}

        <button className="am-done" onClick={onDone}>
          {log.length > 0 ? 'Done — ready for next race' : 'Skip — no points'}
        </button>
      </div>
    </div>
  )
}
