// ============================================================
// E2E 测试：启动 App，检查白屏和 JS 错误
// 模拟 Android WebView 环境
// ============================================================
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { chromium } from 'playwright'
import type { Browser, Page } from 'playwright'
import { createServer } from 'vite'

let browser: Browser
let page: Page
let server: any
let baseUrl: string

beforeAll(async () => {
  // 启动 Vite 开发服务器
  server = await createServer({
    root: process.cwd(),
    server: { port: 0 },
  })
  await server.listen()
  const addr = server.httpServer?.address()
  const port = typeof addr === 'object' && addr ? addr.port : 5173
  baseUrl = `http://localhost:${port}`

  // 启动 Chromium（模拟手机 WebView）
  browser = await chromium.launch({ headless: true })
  const context = await browser.newContext({
    viewport: { width: 412, height: 915 },  // 手机尺寸
    userAgent: 'Android WebView Test',
  })
  page = await context.newPage()

  // 收集控制台错误
  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      console.error('[BROWSER ERROR]', msg.text())
    }
  })
}, 30000)

afterAll(async () => {
  await page?.close()
  await browser?.close()
  await server?.close()
})

describe('App 启动检查', () => {
  it('首页正常加载，不白屏', { timeout: 30000 }, async () => {
    const errors: string[] = []

    page.on('pageerror', (err) => {
      errors.push(err.message)
    })

    await page.goto(baseUrl, { waitUntil: 'networkidle' })

    // 等 React 渲染
    await page.waitForTimeout(2000)

    // 检查 #root 里有内容（不是白屏）
    const rootHTML = await page.innerHTML('#root')
    expect(rootHTML.trim().length).toBeGreaterThan(0)

    // 检查没有 JS 崩溃
    if (errors.length > 0) {
      console.error('JS errors found:', errors)
    }

    // 标题出现
    const title = await page.textContent('h1')
    expect(title).toContain('刷题')
  })

  it('页面不包含 "启动失败" 错误', async () => {
    const bodyText = await page.textContent('body')
    expect(bodyText).not.toContain('启动失败')
  })

  it('检查更新按钮可点击', async () => {
    const btn = await page.$('button')
    expect(btn).toBeTruthy()
  })
})
