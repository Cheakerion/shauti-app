// @vitest-environment jsdom
// ============================================================
// Home 页面 — 版本检测 & 下载交互测试
// ============================================================
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, act, waitFor, fireEvent } from '@testing-library/react'
import { HashRouter } from 'react-router-dom'
import 'fake-indexeddb/auto'
import Home from '../pages/Home'

// ============================================================
// 全局 Mock
// ============================================================
const mockAnchorClick = vi.fn()

const fetchQueue: Array<() => Promise<any>> = []
function qFetch(fn: () => Promise<any>) { fetchQueue.push(fn) }
globalThis.fetch = vi.fn(async () => {
  const fn = fetchQueue.shift()
  if (!fn) return Promise.reject(new Error('queue empty'))
  return fn()
}) as any

globalThis.alert = vi.fn()
globalThis.confirm = vi.fn(() => true)
globalThis.URL.createObjectURL = vi.fn(() => 'blob:test')
globalThis.URL.revokeObjectURL = vi.fn()
globalThis.open = vi.fn()

const ver = (v: string) => ({ ok: true, status: 200, json: async () => ({ version: v }) })
const apk = () => ({ ok: true, status: 200, blob: async () => new Blob(['apk']) })

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
  fetchQueue.length = 0

  const origCE = document.createElement.bind(document)
  vi.spyOn(document, 'createElement').mockImplementation((tag: string, opts?: any) => {
    const el = origCE(tag, opts)
    if (tag === 'a') Object.defineProperty(el, 'click', { value: mockAnchorClick })
    return el
  })
})

afterEach(() => { vi.restoreAllMocks() })

function renderHome() {
  return render(<HashRouter><Home /></HashRouter>)
}

// ============================================================
// 一、自动检测（三保险）
// ============================================================
describe('autoCheckUpdate', () => {
  it('GitHub API raw 可用 → 发现新版本', async () => {
    localStorage.setItem('quiz_app_ver', '1.0')
    qFetch(() => Promise.resolve(ver('1.18')))

    renderHome()

    await waitFor(() => {
      expect(screen.getByText(/发现新版本/)).toBeTruthy()
    }, { timeout: 5000 })
  })

  it('API 失败 → raw 成功', async () => {
    localStorage.setItem('quiz_app_ver', '1.0')
    qFetch(() => Promise.reject(new Error('api')))
    qFetch(() => Promise.resolve(ver('1.18')))

    renderHome()

    await waitFor(() => {
      expect(screen.getByText(/发现新版本/)).toBeTruthy()
    }, { timeout: 5000 })
  })

  it('API + raw 失败 → CDN 兜底', async () => {
    localStorage.setItem('quiz_app_ver', '1.0')
    qFetch(() => Promise.reject(new Error('api')))
    qFetch(() => Promise.reject(new Error('raw')))
    qFetch(() => Promise.resolve(ver('1.18')))

    renderHome()

    await waitFor(() => {
      expect(screen.getByText(/发现新版本/)).toBeTruthy()
    }, { timeout: 5000 })
  })

  it('三个源全挂 → 静默', async () => {
    localStorage.setItem('quiz_app_ver', '1.0')
    qFetch(() => Promise.reject(new Error('x')))
    qFetch(() => Promise.reject(new Error('x')))
    qFetch(() => Promise.reject(new Error('x')))

    renderHome()
    await new Promise(r => setTimeout(r, 300))
    expect(screen.queryByText(/发现新版本/)).toBeNull()
  })

  it('版本相同 → 不显示', async () => {
    localStorage.setItem('quiz_app_ver', '1.18')
    qFetch(() => Promise.resolve(ver('1.18')))

    renderHome()
    await new Promise(r => setTimeout(r, 500))
    expect(screen.queryByText(/发现新版本/)).toBeNull()
  })
})

// ============================================================
// 二、手动检测
// ============================================================
describe('checkUpdate', () => {
  it('三个源全挂 → 提示"检测失败"', async () => {
    localStorage.setItem('quiz_app_ver', '1.0')
    qFetch(() => Promise.resolve(ver('1.0')))     // auto-check
    qFetch(() => Promise.reject(new Error('x')))  // api
    qFetch(() => Promise.reject(new Error('x')))  // raw
    qFetch(() => Promise.reject(new Error('x')))  // cdn

    renderHome()
    await act(async () => { await new Promise(r => setTimeout(r, 200)) })
    await act(async () => { fireEvent.click(screen.getByText('🔄 检查更新')) })

    await waitFor(() => {
      expect(globalThis.alert).toHaveBeenCalledWith(expect.stringContaining('检测失败'))
    })
  })

  it('有新版本 → confirm → 下载', { timeout: 10000 }, async () => {
    localStorage.setItem('quiz_app_ver', '1.0')
    qFetch(() => Promise.resolve(ver('1.0')))
    qFetch(() => Promise.resolve(ver('1.18')))
    qFetch(() => Promise.resolve(apk()))

    renderHome()
    await act(async () => { await new Promise(r => setTimeout(r, 200)) })

    await act(async () => { fireEvent.click(screen.getByText('🔄 检查更新')) })

    await waitFor(() => {
      expect(globalThis.confirm).toHaveBeenCalled()
      expect(localStorage.getItem('quiz_app_ver')).toBe('1.18')
    }, { timeout: 8000 })
  })

  it('全挂 → 提示检测失败', async () => {
    localStorage.setItem('quiz_app_ver', '1.0')
    qFetch(() => Promise.resolve(ver('1.0')))
    qFetch(() => Promise.reject(new Error('x')))
    qFetch(() => Promise.reject(new Error('x')))
    qFetch(() => Promise.reject(new Error('x')))

    renderHome()
    await act(async () => { await new Promise(r => setTimeout(r, 200)) })

    await act(async () => { fireEvent.click(screen.getByText('🔄 检查更新')) })

    await waitFor(() => {
      expect(globalThis.alert).toHaveBeenCalledWith(expect.stringContaining('检测失败'))
    })
  })
})

// ============================================================
// 三、下载按钮（蓝框和手动检查统一走 checkUpdate）
// ============================================================
describe('下载按钮', () => {
  it('蓝框按钮 → 触发 checkUpdate → confirm 确定 → 下载', { timeout: 10000 }, async () => {
    localStorage.setItem('quiz_app_ver', '1.0')
    qFetch(() => Promise.resolve(ver('1.18')))   // auto-check → shows banner
    qFetch(() => Promise.resolve(ver('1.18')))   // checkUpdate called by blue button
    qFetch(() => Promise.resolve(apk()))          // download APK

    renderHome()

    await waitFor(() => {
      expect(screen.getByText(/发现新版本/)).toBeTruthy()
    }, { timeout: 5000 })

    // 点蓝框"下载更新"按钮（现在走 checkUpdate → confirm → handleDownload）
    await act(async () => { fireEvent.click(screen.getByText('下载更新')) })

    await waitFor(() => {
      expect(localStorage.getItem('quiz_app_ver')).toBe('1.18')
      expect(screen.getByText(/下载完成/)).toBeTruthy()
    }, { timeout: 8000 })
  })
})
