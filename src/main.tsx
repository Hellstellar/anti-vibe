import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './theme.css'
import App from './App'
import { connectBridge } from './bridge/receiver'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

// Receive documents pushed by the Fixate MCP bridge (no-op off the bridge).
connectBridge()
