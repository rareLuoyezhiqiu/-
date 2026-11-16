import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import { VitePWA } from 'vite-plugin-pwa';
export default defineConfig({ plugins: [vue(), VitePWA({
  registerType: 'prompt', injectRegister: false, includeAssets: ['icon-192.png', 'icon-512.png'],
  manifest: { name: '灵感清单', short_name: '灵感清单', description: '不必完整，先记下来。', lang: 'zh-CN', start_url: '/', display: 'standalone', background_color: '#f8f9f7', theme_color: '#f8f9f7', icons: [{ src: '/icon-192.png', sizes: '192x192', type: 'image/png' }, { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' }] },
  workbox: { globPatterns: ['**/*.{js,css,html,png,webmanifest}'], cleanupOutdatedCaches: true, clientsClaim: true }
})], server: { host: '0.0.0.0', port: 4173, strictPort: true }, preview: { host: '0.0.0.0', port: 4173, strictPort: true } });
