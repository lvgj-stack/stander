import path from 'node:path'

import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { '@': path.resolve(import.meta.dirname, './src') },
  },
  server: {
    port: 5173,
    // Dev talks to the Go binary directly. The backend sets
    // AllowAllOrigins, but the captcha needs its session cookie to survive
    // the round trip, so proxying keeps everything same-origin in dev.
    proxy: {
      // Must stay in sync with nginx.conf. `permission` and `role` are absent
      // on purpose: those endpoints are gone — the first with the dynamic
      // menu, the second when roles collapsed to two the console names itself.
      '^/(auth|user|stander)(/|$)': {
        target: process.env.VITE_DEV_PROXY_TARGET ?? 'http://127.0.0.1:8123',
        changeOrigin: false,
      },
    },
  },
})
