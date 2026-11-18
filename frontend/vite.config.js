import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// This is an organization site (repo dws-manager-bot.github.io), served from
// the domain root, so assets are requested from "/" rather than a repo prefix.
export default defineConfig({
  // Tailwind only builds src/guide/guide.css (it scans src/guide alone); no
  // other stylesheet on the site uses it.
  plugins: [react(), tailwindcss()],
  base: process.env.VITE_BASE ?? '/',
  build: { outDir: 'dist', sourcemap: false },
  resolve: {
    // The season guide's own imports ("@/components/ui/button"), kept as its repo has them.
    alias: { '@': fileURLToPath(new URL('./src/guide', import.meta.url)) },
  },
})
