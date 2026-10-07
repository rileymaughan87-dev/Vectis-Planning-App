import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  // Relative paths, so the build works from any folder (e.g. GitHub Pages).
  base: './',
  plugins: [react()],
  resolve: {
    // Shared design and helpers (see suite/README.md).
    alias: { '@suite': fileURLToPath(new URL('../suite/src', import.meta.url)) },
  },
})
