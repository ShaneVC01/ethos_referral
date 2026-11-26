import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';

// Two entries: `index.html` is the staff app (PWA, service worker),
// `refer.html` is the public referral form (no app code, no service worker).
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'prompt',
      includeAssets: ['brand/ethos-logo.png', 'icons/icon.svg', 'icons/apple-touch-icon.png', 'icons/favicon-32.png', 'icons/favicon-16.png'],
      manifest: {
        id: '/',
        name: 'Ethos Referrals',
        short_name: 'Ethos Referrals',
        description: 'Referral management for Ethos Orthodontics',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        theme_color: '#4F7366',
        background_color: '#FFFFFF',
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: '/icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
          { src: '/icons/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        // Default precache limit. Seed chunks are excluded below, so nothing large is needed here.
        maximumFileSizeToCacheInBytes: 3 * 1024 * 1024,
        // The public form is a separate bundle and must not be precached by the staff app.
        // Seed chunks (patient data, written to dist/seed) are never precached, so they stay out of device caches.
        globIgnores: ['**/refer.html', '**/assets/refer-*', '**/seed/**'],
        navigateFallback: '/index.html',
        // Never serve the app shell for the public form or its assets.
        navigateFallbackDenylist: [/^\/refer/],
      },
      devOptions: { enabled: false },
    }),
  ],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  build: {
    rollupOptions: {
      input: {
        main: fileURLToPath(new URL('./index.html', import.meta.url)),
        refer: fileURLToPath(new URL('./refer.html', import.meta.url)),
      },
      output: {
        // Seed JSON chunks go to dist/seed so the service worker can ignore them by path.
        chunkFileNames: (chunk) => (chunk.facadeModuleId?.replace(/\\/g, '/').includes('/seed/') ? 'seed/[name]-[hash].js' : 'assets/[name]-[hash].js'),
      },
    },
  },
});
