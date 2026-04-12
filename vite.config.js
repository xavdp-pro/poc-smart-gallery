import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 9999,
    strictPort: true,
    allowedHosts: ['smartgallery.xavdp.pro'],
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8888',
        changeOrigin: true,
      },
      '/uploads': {
        target: 'http://127.0.0.1:8888',
        changeOrigin: true,
      },
      '/socket.io': {
        target: 'http://127.0.0.1:8888',
        changeOrigin: true,
        ws: true,
      }
    }
  },
  preview: {
    host: '0.0.0.0',
    port: 9999,
    strictPort: true,
  }
})
