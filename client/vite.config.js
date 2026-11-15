import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

const apiTarget = process.env.VITE_DEV_API_TARGET || 'http://localhost:8787';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      // The 3D bodies (4-8 MB each) are NOT pre-downloaded: that cost every first visit about 28 MB
      // and bypassed the slow-connection question. They are kept the first time they are viewed.
      includeAssets: ['favicon.svg', 'icons/*.png', 'avatars/*.svg'],
      manifest: {
        name: 'Evexia · Astronaut Health Monitoring Console',
        short_name: 'Evexia',
        description: 'NASA Space Apps Challenge 2026: Crew health telemetry, decision support, and delay-tolerant comms.',
        theme_color: '#0A0C10',
        background_color: '#0A0C10',
        display: 'standalone',
        orientation: 'any',
        scope: '/',
        start_url: '/',
        icons: [
          {
            src: '/icons/icon-192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: '/icons/icon-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: '/icons/icon-maskable-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
          {
            src: '/favicon.svg',
            sizes: 'any',
            type: 'image/svg+xml',
          },
        ],
      },
      workbox: {
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
        globPatterns: ['**/*.{js,css,html,ico,png,svg,json}'],
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/api/],
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.pathname.startsWith('/api/health'),
            handler: 'NetworkOnly',
          },
          {
            // A body model is saved the first time it is shown, then works with no connection.
            urlPattern: ({ url }) => url.pathname.startsWith('/models/') && url.pathname.endsWith('.glb'),
            handler: 'CacheFirst',
            options: {
              cacheName: 'evexia-models',
              expiration: { maxEntries: 8 },
              cacheableResponse: { statuses: [200] },
            },
          },
        ],
      },
    }),
  ],
  server: {
    port: 5173,
    proxy: { '/api': { target: apiTarget, changeOrigin: true } },
  },
  preview: {
    port: 4173,
    proxy: { '/api': { target: apiTarget, changeOrigin: true } },
  },
  build: {
    chunkSizeWarningLimit: 1200,
  },
  test: {
    include: ['tests/**/*.test.js'],
    environment: 'node',
  },
});
