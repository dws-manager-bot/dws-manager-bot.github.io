import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// This is an organization site (repo dws-manager-bot.github.io), served from
// the domain root, so assets are requested from "/" rather than a repo prefix.
export default defineConfig({
  plugins: [react()],
  base: process.env.VITE_BASE ?? '/',
  build: { outDir: 'dist', sourcemap: false },
})
