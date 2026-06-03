import { useState } from 'react'
import { useReader } from '../store/readerStore'
import './SettingsPanel.css'

export default function SettingsPanel() {
  const cfg = useReader((s) => s.cfg)
  const setCfg = useReader((s) => s.setCfg)
  const [open, setOpen] = useState(false)

  return (
    <div className={`settings ${open ? 'open' : ''}`}>
      <button
        className="settings-toggle"
        onClick={() => setOpen((o) => !o)}
        title="Settings"
      >
        ⚙
      </button>

      {open && (
        <div className="settings-body">
          <label className="setting">
            <span>
              target wpm <b>{cfg.targetWpm}</b>
            </span>
            <input
              type="range"
              min={100}
              max={800}
              step={25}
              value={cfg.targetWpm}
              onChange={(e) => setCfg({ targetWpm: Number(e.target.value) })}
            />
          </label>

          <label className="setting">
            <span>
              words / flash <b>{cfg.chunkSize}</b>
            </span>
            <input
              type="range"
              min={1}
              max={5}
              step={1}
              value={cfg.chunkSize}
              onChange={(e) => setCfg({ chunkSize: Number(e.target.value) })}
            />
          </label>

          <label className="setting">
            <span>
              start wpm <b>{cfg.startWpm}</b>
            </span>
            <input
              type="range"
              min={60}
              max={cfg.targetWpm}
              step={10}
              value={Math.min(cfg.startWpm, cfg.targetWpm)}
              onChange={(e) => setCfg({ startWpm: Number(e.target.value) })}
            />
          </label>

          <label className="setting">
            <span>
              illumination <b>{cfg.spotlightRadius}px</b>
            </span>
            <input
              type="range"
              min={40}
              max={400}
              step={10}
              value={cfg.spotlightRadius}
              onChange={(e) => setCfg({ spotlightRadius: Number(e.target.value) })}
            />
          </label>
          <div className="setting-note">tip: cmd/ctrl + scroll to resize</div>
        </div>
      )}
    </div>
  )
}
