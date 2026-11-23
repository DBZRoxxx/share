import { resolve } from 'node:path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'electron-vite'
import type { PluginOption } from 'vite'

/**
 * The dev server injects an inline React Refresh preamble, which the strict
 * production CSP (script-src 'self') would block. Relax it in dev only.
 */
function devCsp(): PluginOption {
  return {
    name: 'share:dev-csp',
    apply: 'serve',
    transformIndexHtml: (html) =>
      html.replace("script-src 'self'", "script-src 'self' 'unsafe-inline'"),
  }
}

// Runtime deps listed in package.json "dependencies" (electron-updater and the
// native loopback-capture addon) are externalized automatically and shipped in
// node_modules; everything else — including @share/shared — is bundled.
export default defineConfig({
  main: {
    // Electron's unpatched fs (for reading/writing .asar files as plain files).
    build: { rolldownOptions: { external: ['original-fs'] } },
  },
  preload: {},
  renderer: {
    resolve: {
      alias: {
        '@': resolve(__dirname, 'src/renderer/src'),
        '@shared': resolve(__dirname, 'src/shared'),
      },
      // One React instance, always (hooks break with two copies).
      dedupe: ['react', 'react-dom'],
    },
    plugins: [react(), tailwindcss(), devCsp()],
    worker: { format: 'es' },
  },
})
