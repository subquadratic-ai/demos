import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'
import { snapServer } from './snap-server.ts'

// The '' prefix loads every variable in .env for the server-side Snap route.
// Only VITE_-prefixed variables ever reach the browser, so SUBQ_API_KEY stays
// on your machine.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  return {
    plugins: [react(), tailwindcss(), snapServer(env)],
    // Listen on this machine only: anyone who can reach the server can spend your credits.
    server: { host: 'localhost' },
    preview: { host: 'localhost' },
  }
})
