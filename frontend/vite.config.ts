import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  // Keep asset URLs portable across GitHub Pages project sites.
  base: './',
  plugins: [react()],
  server: { port: 5173 },
  build: { sourcemap: true },
})
