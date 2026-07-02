import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './theme.css'
import App from './App'
import { connectBridge } from './bridge/receiver'
import { applyStoredDisplay } from './lib/theme'
import { useFlow } from './store/flowStore'
import { flowSample } from './lib/flowSample'

// Apply the saved theme + alignment before first paint so there's no flash of
// the defaults (single localStorage parse).
applyStoredDisplay()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

// Receive documents pushed by the Anti-Vibe MCP bridge (no-op off the bridge).
connectBridge()

// Dev/demo: `?flowdemo` loads a hand-written Flow Review so the mode can be seen
// without an agent or the bridge.
if (typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('flowdemo')) {
  useFlow.getState().loadFlow(flowSample)
}
