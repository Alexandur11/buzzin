import { useEffect, useState } from 'react'
import Home from './components/Home'
import Room from './components/Room'
import { leaveRoom } from './store/rooms'
import './App.css'

export default function App() {
  const [visible, setVisible]       = useState(false)
  const [currentRoom, setCurrentRoom] = useState(null)

  useEffect(() => {
    const t = setTimeout(() => setVisible(true), 100)
    return () => clearTimeout(t)
  }, [])

  useEffect(() => {
    if (!currentRoom) return
    function handleUnload() { leaveRoom(currentRoom.code) }
    window.addEventListener('beforeunload', handleUnload)
    return () => window.removeEventListener('beforeunload', handleUnload)
  }, [currentRoom])

  async function handleLogoClick() {
    if (currentRoom) { leaveRoom(currentRoom.code); setCurrentRoom(null) }
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
        <Room room={currentRoom} onLeave={() => setCurrentRoom(null)} />
      ) : (
        <>
          <Home onEnterRoom={setCurrentRoom} />
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
