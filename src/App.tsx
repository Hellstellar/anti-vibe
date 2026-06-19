import { useEffect } from 'react'
import { useReader } from './store/readerStore'
import { sfx, setSoundEnabled } from './lib/sfx'
import { applyTheme } from './lib/theme'
import LandingView from './components/LandingView'
import ReaderView from './components/ReaderView'
import SettingsPanel from './components/SettingsPanel'
import HelpPanel from './components/HelpPanel'
import CrtOverlay from './components/CrtOverlay'

export default function App() {
  const hasContent = useReader((s) => s.tokens.length > 0)

  // Play theme SFX on meaningful store transitions.
  useEffect(() => {
    let prev = useReader.getState()
    setSoundEnabled(prev.cfg.soundOn)
    applyTheme(prev.cfg.theme)
    return useReader.subscribe((s) => {
      setSoundEnabled(s.cfg.soundOn)
      if (s.cfg.theme !== prev.cfg.theme) applyTheme(s.cfg.theme)
      if (prev.tokens.length === 0 && s.tokens.length > 0) sfx.boot()
      if (s.revealed && !prev.revealed) sfx.reveal()
      if (s.currentSection !== prev.currentSection) sfx.section()
      if (s.mode !== prev.mode) {
        if (s.mode === 'playing' || s.mode === 'stepping') sfx.start()
        else if (
          (prev.mode === 'playing' || prev.mode === 'stepping') &&
          s.mode === 'section'
        )
          sfx.pause()
      }
      if (s.mode === 'playing' && s.currentIndex !== prev.currentIndex) {
        const t = s.tokens[s.currentIndex]
        if (t && t.kind === 'word' && t.listItemStart) sfx.listItem()
      }
      if (s.mode === 'stepping' && s.stepIndex !== prev.stepIndex) sfx.click()
      prev = s
    })
  }, [])

  return (
    <>
      {hasContent ? <ReaderView /> : <LandingView />}
      <SettingsPanel />
      <HelpPanel />
      <CrtOverlay />
    </>
  )
}
