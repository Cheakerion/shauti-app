import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App'

// 全局错误捕获：避免白屏，至少显示报错信息
window.addEventListener('error', (e) => {
  const root = document.getElementById('root')
  if (root && !root.innerHTML.trim()) {
    root.innerHTML = `<div style="padding:40px;font-family:sans-serif;">
      <h2 style="color:#dc2626">启动失败</h2>
      <p style="color:#64748b;word-break:break-all;font-size:14px">${e.message || '未知错误'}</p>
      <p style="color:#94a3b8;font-size:12px">${e.filename || ''}:${e.lineno || ''}</p>
    </div>`
  }
})

window.addEventListener('unhandledrejection', (e) => {
  const root = document.getElementById('root')
  if (root && !root.innerHTML.trim()) {
    root.innerHTML = `<div style="padding:40px;font-family:sans-serif;">
      <h2 style="color:#dc2626">启动失败</h2>
      <p style="color:#64748b;word-break:break-all;font-size:14px">${String(e.reason?.message || e.reason || '未知错误')}</p>
    </div>`
  }
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
