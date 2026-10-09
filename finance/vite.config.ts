import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'
import { defineConfig, loadEnv } from 'vite'

// Sync uses the same Firebase project as Planner, so its setting is read
// from Planner's web/.env.local — one copy for both apps. (The deploy sets
// VITE_FIREBASE_CONFIG directly, which takes precedence.)
export default defineConfig(({ mode }) => {
  const shared = loadEnv(mode, fileURLToPath(new URL('../web', import.meta.url)), 'VITE_FIREBASE_')
  const firebase = process.env.VITE_FIREBASE_CONFIG ?? shared.VITE_FIREBASE_CONFIG
  return {
    // Relative paths: served from …/Vectis-Planning-App/finance/ on GitHub Pages.
    base: './',
    plugins: [react()],
    define: firebase ? { 'import.meta.env.VITE_FIREBASE_CONFIG': JSON.stringify(firebase) } : {},
    resolve: {
      // Shared design and helpers (see suite/README.md).
      alias: { '@suite': fileURLToPath(new URL('../suite/src', import.meta.url)) },
    },
  }
})
