import './HistoryPanel.css'

export default function HistoryPanel({ history }) {
  if (!history?.length) return (
    <div className="history-panel">
      <p className="hp-title">SESSION HISTORY</p>
      <p className="hp-empty">No completed races yet.</p>
    </div>
  )

  return (
    <div className="history-panel">
      <p className="hp-title">SESSION HISTORY</p>
      {history.map(snap => (
        <details key={snap.raceNumber} className="hp-race">
          <summary className="hp-summary">
            <span className="hp-race-num">Race #{snap.raceNumber}</span>
            <span className="hp-race-time">{new Date(snap.closedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>
            <span className="hp-race-count">{snap.results?.filter(r => !r.noResponse && !r.earlyClick).length} responses</span>
          </summary>

          <table className="hp-table">
            <thead>
              <tr>
                <th className="hp-th pos">#</th>
                <th className="hp-th">Username</th>
                <th className="hp-th">Team</th>
                <th className="hp-th right">Time</th>
              </tr>
            </thead>
            <tbody>
              {snap.results?.filter(r => !r.noResponse && !r.earlyClick).map((r, idx) => (
                <tr key={r.sessionId} className="hp-row">
                  <td className="hp-td pos">{idx + 1}</td>
                  <td className="hp-td">{r.username}</td>
                  <td className="hp-td">{r.team ?? <span className="solo-chip">Solo</span>}</td>
                  <td className="hp-td right">{(r.reactionTime / 1000).toFixed(3)}s</td>
                </tr>
              ))}
              {snap.results?.filter(r => r.earlyClick).map(r => (
                <tr key={r.sessionId} className="hp-row early-row">
                  <td className="hp-td pos">⚡</td>
                  <td className="hp-td">{r.username}</td>
                  <td className="hp-td">{r.team ?? <span className="solo-chip">Solo</span>}</td>
                  <td className="hp-td right" style={{ color: '#fbbf24', fontStyle: 'italic', fontSize: '0.8rem' }}>Early</td>
                </tr>
              ))}
              {snap.results?.filter(r => r.noResponse).map(r => (
                <tr key={r.sessionId} className="hp-row no-resp-row">
                  <td className="hp-td pos">—</td>
                  <td className="hp-td">{r.username}</td>
                  <td className="hp-td">{r.team ?? <span className="solo-chip">Solo</span>}</td>
                  <td className="hp-td right" style={{ color: 'var(--text-muted)', fontStyle: 'italic', fontSize: '0.8rem' }}>No Response</td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      ))}
    </div>
  )
}
