import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@suite/fonts'
import '@suite/styles.css'
import './index.css'
import App from './App.tsx'
// Reconnects sync on opening, on devices that sync.
import './store/sync'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
