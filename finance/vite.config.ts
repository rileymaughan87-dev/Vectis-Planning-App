import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'

export default defineConfig({
  // Relative paths: served from …/Vectis-Planning-App/finance/ on GitHub Pages.
  base: './',
  plugins: [react()],
  resolve: {
    // Shared design and helpers (see suite/README.md).
    alias: { '@suite': fileURLToPath(new URL('../suite/src', import.meta.url)) },
  },
})
