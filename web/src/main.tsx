import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@suite/fonts'
import '@suite/styles.css'
import './index.css'
import App from './App.tsx'
// Reconnects sync on opening, on devices that sync.
import './store/sync'
// Shared calendars, while sync is on.
import './store/sharedLive'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
