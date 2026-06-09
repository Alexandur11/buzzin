import { useState } from 'react'
import { createRoom, joinRoom } from '../store/rooms'
import UsernameModal from './UsernameModal'
import './Home.css'

export default function Home({ onEnterRoom }) {
  const [joinCode, setJoinCode] = useState('')
  const [joinError, setJoinError] = useState('')
  const [loading, setLoading] = useState(false)
  const [tab, setTab] = useState('create')
  // pendingAction holds what we do once username is confirmed
  const [pendingAction, setPendingAction] = useState(null) // null | 'create' | 'join'

  function handleCreateClick() {
    setPendingAction('create')
  }

  function handleJoinClick(e) {
    e.preventDefault()
    setJoinError('')
    setPendingAction('join')
  }

  async function handleUsernameConfirm(username) {
    setLoading(true)
    try {
      let room
      if (pendingAction === 'create') {
        room = await createRoom(username)
      } else {
        room = await joinRoom(joinCode, username)
      }
      onEnterRoom(room)
    } catch (err) {
      setPendingAction(null)
      setJoinError(
        err.message === 'Room not found'
          ? 'No room found with that code.'
          : 'Could not connect. Is the server running?'
      )
    } finally {
      setLoading(false)
    }
  }

  function handleCodeInput(e) {
    let val = e.target.value.toUpperCase().replace(/[^A-Z0-9-]/g, '')
    if (val.length === 3 && !val.includes('-')) val = val + '-'
    if (val.length > 7) val = val.slice(0, 7)
    setJoinCode(val)
    setJoinError('')
  }

  return (
    <>
      {pendingAction && (
        <UsernameModal
          onConfirm={handleUsernameConfirm}
          loading={loading}
        />
      )}

      <div className="home">
        <div className="home-card">
          <div className="home-tabs">
            <button
              className={`tab-btn ${tab === 'create' ? 'active' : ''}`}
              onClick={() => { setTab('create'); setJoinError('') }}
            >
              Create Room
            </button>
            <button
              className={`tab-btn ${tab === 'join' ? 'active' : ''}`}
              onClick={() => { setTab('join'); setJoinError('') }}
            >
              Join Room
            </button>
          </div>

          <div className="home-panel">
            {tab === 'create' ? (
              <div className="panel-create">
                <p className="panel-desc">
                  Start a new room and share the code with others so they can join.
                </p>
                {joinError && <p className="error-msg" style={{ marginBottom: 16 }}>{joinError}</p>}
                <button className="btn-primary wide" onClick={handleCreateClick}>
                  Create Room
                </button>
              </div>
            ) : (
              <form className="panel-join" onSubmit={handleJoinClick}>
                <p className="panel-desc">
                  Enter the 6-character room code to join an existing session.
                </p>
                <div className="input-row">
                  <input
                    className={`code-input ${joinError ? 'input-error' : ''}`}
                    type="text"
                    placeholder="ABC-123"
                    value={joinCode}
                    onChange={handleCodeInput}
                    autoFocus
                    spellCheck={false}
                  />
                  <button
                    className="btn-primary"
                    type="submit"
                    disabled={joinCode.replace('-', '').length < 6}
                  >
                    Join
                  </button>
                </div>
                {joinError && <p className="error-msg">{joinError}</p>}
              </form>
            )}
          </div>
        </div>
      </div>
    </>
  )
}
