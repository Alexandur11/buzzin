import { useEffect, useState } from 'react'
import Home from './components/Home'
import Room from './components/Room'
import { SESSION_ID, leaveRoom, joinRoom, pollRoom, getLastSession, clearLastSession } from './store/rooms'
import './App.css'

const initialJoinCode = new URLSearchParams(window.location.search).get('join') ?? ''

export default function App() {
  const [visible, setVisible]       = useState(false)
  const [currentRoom, setCurrentRoom] = useState(null)

  useEffect(() => {
    const t = setTimeout(() => setVisible(true), 100)
    return () => clearTimeout(t)
  }, [])

  // Attempt silent rejoin on load if a previous session exists
  useEffect(() => {
    const last = getLastSession()
    if (!last) return
    pollRoom(last.code)
      .then(room => {
        const stillMember = room.leaderboard?.some(e => e.sessionId === SESSION_ID)
        if (stillMember) {
          setCurrentRoom(room)
        } else {
          return joinRoom(last.code, last.username).then(setCurrentRoom)
        }
      })
      .catch(() => clearLastSession())
  }, [])

  useEffect(() => {
    if (!currentRoom) return
    function handleUnload() { leaveRoom(currentRoom.code) }
    window.addEventListener('beforeunload', handleUnload)
    return () => window.removeEventListener('beforeunload', handleUnload)
  }, [currentRoom])

  async function handleLogoClick() {
    if (currentRoom) { leaveRoom(currentRoom.code); clearLastSession(); setCurrentRoom(null) }
  }

  return (
    <div className={`shell ${visible ? 'loaded' : ''} ${currentRoom ? 'in-room' : ''}`}>
      <div className="noise" />

      {/* Top bar — always visible */}
      <header className="header">
        <button className="logo-btn" onClick={handleLogoClick} title="Back to home">
          <span className="logo">BUZZIN</span>
        </button>
        <span className="badge">BETA</span>
        {currentRoom && (
          <span className="header-room-code">
            Room&nbsp;<strong>{currentRoom.code}</strong>
          </span>
        )}
      </header>

      {currentRoom ? (
        <Room
          room={currentRoom}
          onLeave={() => { clearLastSession(); setCurrentRoom(null) }}
          onKicked={() => { clearLastSession(); setCurrentRoom(null) }}
        />
      ) : (
        <>
          <Home onEnterRoom={setCurrentRoom} initialJoinCode={initialJoinCode} />
          <div className="ticker">
            <div className="ticker-inner">
              {Array(6).fill('BUZZIN · LIVE ROOMS · SHARE THE CODE · ').map((t, i) => (
                <span key={i}>{t}</span>
              ))}
            </div>
          </div>
          <footer className="footer">
            <span>© 2026 Buzzin</span>
            <span className="footer-status"><span className="dot-live" />All systems operational</span>
          </footer>
        </>
      )}
    </div>
  )
}
