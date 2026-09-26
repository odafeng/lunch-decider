import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [react(), VitePWA({
    registerType: 'prompt',
    injectRegister: null,
    includeAssets: ['favicon.svg', 'icons/*.png'],
    manifest: {
      id: '/',
      name: '呷啥 CHIA SHÁ — 餐廳選擇器',
      short_name: '呷啥',
      description: '挑選附近餐廳，依料理、星等與評論數，決定今天吃什麼。',
      lang: 'zh-Hant',
      start_url: '/',
      scope: '/',
      display: 'standalone',
      theme_color: '#f7f7ef',
      background_color: '#fbfbf7',
      categories: ['food', 'lifestyle'],
      icons: [
        { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
        { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
        { src: '/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
      ],
    },
    workbox: {
      cacheId: 'chiasha',
      globPatterns: ['**/*.{js,css,html,svg,png,jpg,webmanifest}'],
      cleanupOutdatedCaches: true,
      clientsClaim: true,
      navigateFallback: '/index.html',
      navigateFallbackDenylist: [/^\/api(?:\/|$)/],
      // Only precache our app and demo assets. API responses and Google photos stay on the network.
      runtimeCaching: [],
    },
  })],
  server: { port: 5173, strictPort: true, proxy: { '/api': 'http://127.0.0.1:3001' } },
});
