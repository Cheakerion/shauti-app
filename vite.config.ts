import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  base: './',
  plugins: [
    // 去掉 crossorigin 属性，避免 WebView file:// 协议下的 CORS 问题
    {
      name: 'remove-crossorigin',
      transformIndexHtml(html) {
        return html.replace(/crossorigin/g, '')
      },
    },
    react(),
  ],
})
