import { useState } from 'react'
import './UsernameModal.css'

export default function UsernameModal({ onConfirm, loading }) {
  const [username, setUsername] = useState('')

  function handleSubmit(e) {
    e.preventDefault()
    const trimmed = username.trim()
    if (trimmed.length < 1) return
    onConfirm(trimmed)
  }

  return (
    <div className="modal-backdrop">
      <div className="modal-card">
        <p className="modal-label">CHOOSE A USERNAME</p>
        <p className="modal-desc">This will be shown on the leaderboard.</p>
        <form onSubmit={handleSubmit}>
          <input
            className="modal-input"
            type="text"
            placeholder="e.g. FlashFingers"
            value={username}
            onChange={e => setUsername(e.target.value.slice(0, 20))}
            autoFocus
            spellCheck={false}
            disabled={loading}
          />
          <button
            className="btn-primary wide"
            type="submit"
            disabled={loading || username.trim().length < 1}
          >
            {loading ? 'Joining…' : 'Enter Room'}
          </button>
        </form>
      </div>
    </div>
  )
}
