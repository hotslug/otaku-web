import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// In development the Rust server runs on :8080; Vite forwards /api to it.
export default defineConfig({
  plugins: [react()],
  server: { proxy: { '/api': 'http://localhost:8080' } },
})
