import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

const backendTarget = process.env.VITE_BACKEND_URL || process.env.BACKEND_URL || 'http://127.0.0.1:8000'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      '/market-filters': {
        target: backendTarget,
        changeOrigin: true,
      },
      '/markets': {
        target: backendTarget,
        changeOrigin: true,
      },
      '/market-catalogue': {
        target: backendTarget,
        changeOrigin: true,
      },
      '/recommend': {
        target: backendTarget,
        changeOrigin: true,
      },
      '/crops': {
        target: backendTarget,
        changeOrigin: true,
      },
      '/forecast': {
        target: backendTarget,
        changeOrigin: true,
      },
      '/health': {
        target: backendTarget,
        changeOrigin: true,
      },
    },
  },
  preview: {
    proxy: {
      '/crops': {
        target: backendTarget,
        changeOrigin: true,
      },
      '/market-filters': {
        target: backendTarget,
        changeOrigin: true,
      },
      '/markets': {
        target: backendTarget,
        changeOrigin: true,
      },
      '/market-catalogue': {
        target: backendTarget,
        changeOrigin: true,
      },
      '/recommend': {
        target: backendTarget,
        changeOrigin: true,
      },
      '/forecast': {
        target: backendTarget,
        changeOrigin: true,
      },
      '/health': {
        target: backendTarget,
        changeOrigin: true,
      },
    },
  },
})
