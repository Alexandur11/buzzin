import { SESSION_ID } from '../store/rooms'
import './Leaderboard.css'

const MEDALS = ['🥇', '🥈', '🥉']

export default function Leaderboard({ entries }) {
  if (!entries?.length) return null

  return (
    <div className="leaderboard">
      <p className="lb-title">LEADERBOARD</p>
      <table className="lb-table">
        <thead>
          <tr>
            <th className="lb-th rank">#</th>
            <th className="lb-th">Player</th>
            <th className="lb-th team-col">Team</th>
            <th className="lb-th pts">Pts</th>
          </tr>
        </thead>
        <tbody>
          {entries.map((entry, idx) => (
            <tr key={entry.sessionId} className={`lb-row ${entry.sessionId === SESSION_ID ? 'lb-row-self' : ''}`}>
              <td className="lb-td rank">
                {MEDALS[idx] ?? <span className="lb-rank-num">{idx + 1}</span>}
              </td>
              <td className="lb-td username">
                {entry.username}
                {entry.sessionId === SESSION_ID && <span className="lb-you"> you</span>}
              </td>
              <td className="lb-td team-col">
                {entry.team ? <span className="lb-team-tag">{entry.team}</span> : <span className="lb-solo">solo</span>}
              </td>
              <td className="lb-td pts">{entry.points}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
