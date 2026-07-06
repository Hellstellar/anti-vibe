import { useEffect } from 'react'
import { useReader } from './store/readerStore'
import { useFlow } from './store/flowStore'
import { sfx, setSoundEnabled } from './lib/sfx'
import { applyTheme, applyAlign } from './lib/theme'
import LandingView from './components/LandingView'
import ReaderView from './components/ReaderView'
import FlowReviewView from './components/FlowReviewView'
import SettingsPanel from './components/SettingsPanel'
import HelpPanel from './components/HelpPanel'
import CommentLayer from './components/CommentLayer'
import LibraryOverlay from './components/LibraryOverlay'
import CrtOverlay from './components/CrtOverlay'

export default function App() {
  const hasContent = useReader((s) => s.tokens.length > 0)
  const flowActive = useFlow((s) => s.stops.length > 0)

  // Trap the hardware/edge-swipe back gesture while the reader is open. Mobile
  // has no in-app back button — only the OS gesture — and a single-page app
  // with no extra history entry treats that gesture as "leave the page", which
  // on a standalone PWA means closing it outright. Pushing a barrier entry and
  // re-arming it on every pop makes back step up one level (RSVP/step ->
  // reading -> heading -> landing) instead, matching Esc / the Back CTA.
  useEffect(() => {
    if (!hasContent) return
    history.pushState({ antivibeReader: true }, '')
    const onPopState = () => {
      const s = useReader.getState()
      if (s.tokens.length === 0) return // already exited (e.g. via ✕)
      if (s.mode === 'section' && !s.revealed) {
        s.exit()
      } else {
        s.goBack()
        history.pushState({ antivibeReader: true }, '')
      }
    }
    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [hasContent])

  // Play theme SFX on meaningful store transitions.
  useEffect(() => {
    let prev = useReader.getState()
    setSoundEnabled(prev.cfg.soundOn)
    applyTheme(prev.cfg.theme)
    applyAlign(prev.cfg.align)
    return useReader.subscribe((s) => {
      setSoundEnabled(s.cfg.soundOn)
      if (s.cfg.theme !== prev.cfg.theme) applyTheme(s.cfg.theme)
      if (s.cfg.align !== prev.cfg.align) applyAlign(s.cfg.align)
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
      {flowActive ? <FlowReviewView /> : hasContent ? <ReaderView /> : <LandingView />}
      <SettingsPanel />
      <HelpPanel />
      <CommentLayer />
      <LibraryOverlay />
      <CrtOverlay />
    </>
  )
}
