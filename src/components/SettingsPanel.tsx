import { useRef, useState } from 'react'
import { useReader } from '../store/readerStore'
import { THEMES } from '../lib/theme'
import { TEXT_ALIGNS, SYMBOL_MODES } from '../lib/types'
import { useClickOutside } from './useClickOutside'
import './SettingsPanel.css'

export default function SettingsPanel() {
  const cfg = useReader((s) => s.cfg)
  const setCfg = useReader((s) => s.setCfg)
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useClickOutside(ref, open, () => setOpen(false))

  return (
    <div ref={ref} className={`settings ${open ? 'open' : ''}`}>
      <button
        className="settings-toggle"
        onClick={() => setOpen((o) => !o)}
        title="Settings"
      >
        ⚙
      </button>

      {open && (
        <div className="settings-body">
          <div className="setting">
            <span>theme</span>
            <div className="theme-row">
              {THEMES.map((t) => (
                <button
                  key={t.id}
                  className={`theme-btn ${cfg.theme === t.id ? 'active' : ''}`}
                  onClick={() => setCfg({ theme: t.id })}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          <div className="setting">
            <span>align</span>
            <div className="theme-row">
              {TEXT_ALIGNS.map((a) => (
                <button
                  key={a}
                  className={`theme-btn ${cfg.align === a ? 'active' : ''}`}
                  onClick={() => setCfg({ align: a })}
                >
                  {a}
                </button>
              ))}
            </div>
          </div>

          <div className="setting">
            <span>symbols</span>
            <div className="theme-row">
              {SYMBOL_MODES.map((m) => (
                <button
                  key={m}
                  className={`theme-btn ${cfg.symbols === m ? 'active' : ''}`}
                  onClick={() => setCfg({ symbols: m })}
                >
                  {m}
                </button>
              ))}
            </div>
          </div>

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

          <button
            className="setting-toggle-btn"
            onClick={() => setCfg({ soundOn: !cfg.soundOn })}
          >
            sound: {cfg.soundOn ? 'on' : 'off'}
          </button>
        </div>
      )}
    </div>
  )
}
