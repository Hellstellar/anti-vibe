import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './theme.css'
import App from './App'
import { connectBridge } from './bridge/receiver'
import { applyTheme, getStoredThemeId } from './lib/theme'

// Apply the saved theme before first paint so there's no flash of the default.
applyTheme(getStoredThemeId())

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

// Receive documents pushed by the Fixate MCP bridge (no-op off the bridge).
connectBridge()
