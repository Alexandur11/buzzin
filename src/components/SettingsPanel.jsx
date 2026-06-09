import { useState } from 'react'
import { updateSettings } from '../store/rooms'
import './SettingsPanel.css'

export default function SettingsPanel({ settings, roomCode, locked }) {
  const [local, setLocal]   = useState({ ...settings })
  const [saving, setSaving] = useState(false)
  const [saved, setSaved]   = useState(false)
  const [error, setError]   = useState('')

  function set(key, val) { setLocal(s => ({ ...s, [key]: val })); setSaved(false); setError('') }

  async function handleSave() {
    setSaving(true); setError('')
    try {
      await updateSettings(roomCode, local)
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } catch (e) { setError(e.message) }
    finally { setSaving(false) }
  }

  return (
    <div className="settings-panel">
      <p className="sp-title">ROOM SETTINGS</p>
      {locked && <p className="sp-locked">Settings locked during an active race.</p>}

      <div className="sp-field">
        <label className="sp-label">Race Duration</label>
        <div className="sp-row">
          <input className="sp-range" type="range" min={3} max={30} step={1}
            value={local.raceDurationMs / 1000}
            onChange={e => set('raceDurationMs', Number(e.target.value) * 1000)}
            disabled={locked} />
          <span className="sp-val">{local.raceDurationMs / 1000}s</span>
        </div>
      </div>

      <div className="sp-field">
        <label className="sp-label">Countdown Duration</label>
        <div className="sp-row">
          <input className="sp-range" type="range" min={1} max={10} step={1}
            value={local.countdownMs / 1000}
            onChange={e => set('countdownMs', Number(e.target.value) * 1000)}
            disabled={locked} />
          <span className="sp-val">{local.countdownMs / 1000}s</span>
        </div>
      </div>

      <div className="sp-field">
        <label className="sp-label">Max Rounds <span className="sp-hint">(0 = unlimited)</span></label>
        <div className="sp-row">
          <input className="sp-range" type="range" min={0} max={20} step={1}
            value={local.maxRounds}
            onChange={e => set('maxRounds', Number(e.target.value))}
            disabled={locked} />
          <span className="sp-val">{local.maxRounds === 0 ? '∞' : local.maxRounds}</span>
        </div>
      </div>

      <div className="sp-field">
        <label className="sp-label">
          <span>Fakeout / Anti-Cheat</span>
          <input className="sp-toggle" type="checkbox"
            checked={local.fakeoutEnabled}
            onChange={e => set('fakeoutEnabled', e.target.checked)}
            disabled={locked} />
          <span className={`sp-toggle-label ${local.fakeoutEnabled ? 'on' : 'off'}`}>
            {local.fakeoutEnabled ? 'ON' : 'OFF'}
          </span>
        </label>
        <p className="sp-desc">Adds a random 0–5s hidden delay after the countdown. Early clicks are disqualified.</p>
      </div>

      {error && <p className="sp-error">{error}</p>}

      <button className="sp-save-btn" onClick={handleSave} disabled={saving || locked}>
        {saving ? 'Saving…' : saved ? '✓ Saved' : 'Save Settings'}
      </button>
    </div>
  )
}
