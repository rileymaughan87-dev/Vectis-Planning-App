import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@suite/styles.css'
import './home.css'
import App from './App.tsx'

// Partner links shared before the apps moved into folders were
// "…/Vectis-Planning-App/#partner=…": send them on to Planner, which reads them.
if (location.hash.includes('partner=')) location.replace(`./planner/${location.hash}`)
else {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
}
