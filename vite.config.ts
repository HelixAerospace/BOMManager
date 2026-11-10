import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

const version = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 12)

// Writes dist/version.json so open tabs can detect that a newer build was deployed.
function versionFile(): Plugin {
  return {
    name: 'version-file',
    apply: 'build',
    closeBundle() {
      writeFileSync(resolve(import.meta.dirname, 'dist/version.json'), JSON.stringify({ version }))
    },
  }
}

// Content-Security-Policy, added only to the production build (the dev server needs inline scripts).
// connect-src 'self' means the app cannot send your data to any other website.
function csp(): Plugin {
  return {
    name: 'csp',
    apply: 'build',
    transformIndexHtml(html) {
      const policy = [
        "default-src 'self'",
        "script-src 'self'",
        "style-src 'self' 'unsafe-inline'",
        "img-src 'self' data: blob:",
        "font-src 'self'",
        "connect-src 'self'",
        "object-src 'none'",
        "base-uri 'self'",
        "form-action 'none'",
      ].join('; ')
      return html.replace('<head>', `<head>\n    <meta http-equiv="Content-Security-Policy" content="${policy}" />`)
    },
  }
}

export default defineConfig({
  base: './',
  plugins: [react(), tailwindcss(), versionFile(), csp()],
  define: { __APP_VERSION__: JSON.stringify(version) },
})
