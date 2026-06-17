import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig(({ mode }) => {
  const isApk = mode === 'apk'
  return {
    base: './',
    plugins: [
      react(),
      // APK 模式：去掉 crossorigin（file:// 不支持）和 manifest link（会触发无用请求）
      ...(isApk ? [{
        name: 'apk-html-transform',
        transformIndexHtml(html: string) {
          return html
            .replace(/\s+crossorigin/g, '')
            .replace(/<link rel="manifest"[^>]*>/g, '')
        },
      }] : []),
      ...(isApk ? [] : [VitePWA({
        registerType: 'autoUpdate',
        includeAssets: ['favicon.svg'],
        manifest: {
          name: '刷题',
          short_name: '刷题',
          description: '自定义刷题程序',
          theme_color: '#2563eb',
          background_color: '#f8fafc',
          display: 'standalone',
          orientation: 'portrait',
          icons: [
            { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
            { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
          ],
        },
        workbox: {
          globPatterns: ['**/*.{js,css,html,ico,png,svg}'],
          runtimeCaching: [{
            urlPattern: /^https?.*/,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'quiz-cache',
              expiration: { maxEntries: 200, maxAgeSeconds: 30 * 24 * 60 * 60 },
            },
          }],
        },
      })]),
    ],
  }
})
