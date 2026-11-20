import { defineConfig } from 'vite'

const localServer = {
  host: '127.0.0.1',
  port: 5174,
  strictPort: true,
  proxy: {
    // Flask confronta l’origine del browser con l’host della richiesta.
    '/api': { target: 'http://127.0.0.1:5001', changeOrigin: false },
  },
}

export default defineConfig({
  oxc: { jsx: { runtime: 'automatic' } },
  server: localServer,
  preview: localServer,
})
