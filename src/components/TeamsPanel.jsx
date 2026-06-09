import { useState } from 'react'
import { SESSION_ID, createTeam, joinTeam, leaveTeam } from '../store/rooms'
import './TeamsPanel.css'

export default function TeamsPanel({ teams, myTeam, roomCode }) {
  const [mode, setMode]       = useState(null) // null | 'create' | 'join'
  const [teamName, setTeamName] = useState('')
  const [error, setError]     = useState('')
  const [busy, setBusy]       = useState(false)

  async function handleCreate(e) {
    e.preventDefault()
    const name = teamName.trim()
    if (!name) return
    setBusy(true); setError('')
    try { await createTeam(roomCode, name); setMode(null); setTeamName('') }
    catch (err) { setError(err.message) }
    finally { setBusy(false) }
  }

  async function handleJoin(name) {
    setBusy(true); setError('')
    try { await joinTeam(roomCode, name) }
    catch (err) { setError(err.message) }
    finally { setBusy(false) }
  }

  async function handleLeave() {
    setBusy(true); setError('')
    try { await leaveTeam(roomCode) }
    catch (err) { setError(err.message) }
    finally { setBusy(false) }
  }

  const soloCount = 0 // derived from parent if needed

  return (
    <div className="teams-panel">
      <div className="teams-header-row">
        <p className="teams-label">TEAMS</p>
        {!myTeam && mode === null && (
          <div className="teams-actions">
            <button className="tpanel-btn accent" onClick={() => { setMode('create'); setError('') }}>+ Create</button>
          </div>
        )}
        {myTeam && (
          <button className="tpanel-btn ghost" onClick={handleLeave} disabled={busy}>Leave</button>
        )}
      </div>

      {/* Create team form */}
      {mode === 'create' && (
        <form className="team-form" onSubmit={handleCreate}>
          <input
            className="team-input"
            placeholder="Team name…"
            value={teamName}
            onChange={e => { setTeamName(e.target.value.slice(0, 24)); setError('') }}
            autoFocus
            disabled={busy}
          />
          <button className="tpanel-btn accent" type="submit" disabled={busy || !teamName.trim()}>
            {busy ? '…' : 'Create'}
          </button>
          <button className="tpanel-btn ghost" type="button" onClick={() => { setMode(null); setTeamName(''); setError('') }}>
            Cancel
          </button>
        </form>
      )}

      {error && <p className="team-error">{error}</p>}

      {/* Team list */}
      {teams.length === 0 && !mode && (
        <p className="teams-empty">No teams yet.</p>
      )}

      {teams.map(team => {
        const isMyTeam = team.name === myTeam
        return (
          <div key={team.name} className={`team-card ${isMyTeam ? 'mine' : ''}`}>
            <div className="team-card-header">
              <span className="team-name">{team.name}</span>
              {!myTeam && (
                <button
                  className="tpanel-btn ghost small"
                  onClick={() => handleJoin(team.name)}
                  disabled={busy}
                >
                  Join
                </button>
              )}
              {isMyTeam && <span className="team-you-badge">YOU</span>}
            </div>
            <ul className="team-members">
              {team.members.map(m => (
                <li key={m.sessionId} className={m.sessionId === SESSION_ID ? 'me' : ''}>
                  {m.username}
                  {m.sessionId === SESSION_ID && <span className="tag-you"> you</span>}
                </li>
              ))}
            </ul>
          </div>
        )
      })}
    </div>
  )
}
