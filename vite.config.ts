/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      // Ship a self-destroying service worker: any browser that still has the old
      // SW installed will unregister it and clear its caches on next load. Offline
      // caching is pure downside for a localhost-served review tool and caused the
      // "old app keeps showing" staleness. Revisit before merging to main.
      selfDestroying: true,
      // Generate all icon/favicon/apple-touch assets from one source SVG and
      // wire them into the manifest + <head> automatically.
      pwaAssets: {
        preset: 'minimal-2023',
        image: 'public/logo.svg',
      },
      manifest: {
        name: 'Anti-Vibe — don\'t just vibe, review what your agent writes',
        short_name: 'Anti-Vibe',
        description:
          'A retro-cyberpunk RSVP reader for reviewing LLM/agent output without the fatigue.',
        theme_color: '#0a0705',
        background_color: '#0a0705',
        display: 'standalone',
        orientation: 'any',
        start_url: '/',
        categories: ['productivity', 'utilities'],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,ico,woff2}'],
        // Cache the Google Fonts used by the theme so the reader works offline.
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
            handler: 'StaleWhileRevalidate',
            options: { cacheName: 'google-fonts-stylesheets' },
          },
          {
            urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts-webfonts',
              expiration: { maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 * 365 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
      devOptions: { enabled: false },
    }),
  ],
  server: { open: true },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'mcp/**/*.test.ts'],
  },
})
