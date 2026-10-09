import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'

export default defineConfig({
  // Relative paths: served from …/Vectis-Planning-App/ on GitHub Pages, with the apps in folders beside it.
  base: './',
  plugins: [react()],
  resolve: {
    // Shared design and helpers (see suite/README.md).
    alias: { '@suite': fileURLToPath(new URL('../suite/src', import.meta.url)) },
  },
})
