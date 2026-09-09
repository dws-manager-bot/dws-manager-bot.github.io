/**
 * A harness for looking at the pages without a login.
 *
 * The backoffice is behind Discord OAuth, so a screenshot of the real thing
 * needs a token. This swaps the API module for a fixture and renders one page
 * on its own, which is the only way to see an empty state, a failed send or a
 * switched-off row without arranging for one to exist.
 *
 * It has earned its keep: `npm run build` proves the JSX parses, not that the
 * component runs. This caught a crash on the very first render.
 *
 *   npx vite build --config probe/vite.config.js
 *   python3 -m http.server 8899 --directory probe-dist
 *   open 'http://localhost:8899/probe/index.html?p=announcements'
 *
 * `?p=` picks the page; `?act=edit|copy&row=N` clicks through to a form.
 */
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'node:path'
export default defineConfig({
  root: path.resolve('.'),
  plugins: [react()],
  resolve: { alias: [{ find: /^.*[\\/]lib[\\/]api\.js$/, replacement: path.resolve('probe/api.js') }] },
  build: { outDir: 'probe-dist', rollupOptions: { input: path.resolve('probe/index.html') }, emptyOutDir: true },
})
