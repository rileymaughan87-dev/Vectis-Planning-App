import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@suite/fonts'
import '@suite/styles.css'
import '@suite/record/record.css'
import './index.css'
import App from './App.tsx'
import { tidyAttachments } from './sync/backup'
// Reconnects sync on opening, on devices that sync.
import './store/sync'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

// Out of the way of start-up: drop pictures that no note uses any more.
setTimeout(tidyAttachments, 8000)
