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

// fetch mock 队列
const fetchQueue: Array<() => Promise<any>> = []
function qFetch(fn: () => Promise<any>) { fetchQueue.push(fn) }
globalThis.fetch = vi.fn(async () => {
  const fn = fetchQueue.shift()
  if (!fn) throw new Error('fetch queue empty')
  return fn()
}) as any

// jsdom 缺失的 API
globalThis.alert = vi.fn()
globalThis.confirm = vi.fn(() => true)
globalThis.URL.createObjectURL = vi.fn(() => 'blob:test')
globalThis.URL.revokeObjectURL = vi.fn()
globalThis.open = vi.fn()

// 版本响应工厂
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
// 一、自动检测更新（启动时）
// ============================================================
describe('autoCheckUpdate', () => {
  it('发现新版本 → 显示 banner', async () => {
    localStorage.setItem('quiz_app_ver', '1.0')
    qFetch(() => Promise.resolve(ver('1.15')))

    renderHome()

    await waitFor(() => {
      expect(screen.getByText(/发现新版本/)).toBeTruthy()
    }, { timeout: 5000 })
  })

  it('版本相同 → 不显示 banner', async () => {
    localStorage.setItem('quiz_app_ver', '1.15')
    qFetch(() => Promise.resolve(ver('1.15')))

    renderHome()

    // 等足够时间确认 banner 不出现
    await new Promise(r => setTimeout(r, 500))
    expect(screen.queryByText(/发现新版本/)).toBeNull()
  })

  it('网络错误 → 不崩溃', async () => {
    localStorage.setItem('quiz_app_ver', '1.0')
    qFetch(() => Promise.reject(new Error('offline')))

    renderHome()
    await new Promise(r => setTimeout(r, 300))
    expect(screen.getByText('📝 刷题')).toBeTruthy()
  })
})

// ============================================================
// 二、手动检测更新
// ============================================================
describe('checkUpdate', () => {
  it('有新版本 → 弹 confirm 确认', async () => {
    localStorage.setItem('quiz_app_ver', '1.0')
    // 自动检测（返回旧版，不干扰）
    qFetch(() => Promise.resolve(ver('1.0')))
    // 手动检测
    qFetch(() => Promise.resolve(ver('1.15')))

    renderHome()
    await act(async () => { await new Promise(r => setTimeout(r, 200)) })

    const btn = screen.getByText('🔄 检查更新')
    await act(async () => { fireEvent.click(btn) })

    await waitFor(() => {
      expect(globalThis.confirm).toHaveBeenCalled()
    })
  })

  it('已是最新 → 弹 alert 提示', async () => {
    localStorage.setItem('quiz_app_ver', '1.15')
    qFetch(() => Promise.resolve(ver('1.0')))
    qFetch(() => Promise.resolve(ver('1.15')))

    renderHome()
    await act(async () => { await new Promise(r => setTimeout(r, 200)) })

    const btn = screen.getByText('🔄 检查更新')
    await act(async () => { fireEvent.click(btn) })

    await waitFor(() => {
      expect(globalThis.alert).toHaveBeenCalled()
    })
  })
})

// ============================================================
// 三、下载
// ============================================================
describe('handleDownload', () => {
  it('下载成功 → Blob → anchor click → URL revoke', async () => {
    localStorage.setItem('quiz_app_ver', '1.0')
    // 自动检测 → 显示 banner
    qFetch(() => Promise.resolve(ver('1.15')))
    // 下载 APK
    qFetch(() => Promise.resolve(apk()))

    renderHome()

    await waitFor(() => {
      expect(screen.getByText(/发现新版本/)).toBeTruthy()
    }, { timeout: 5000 })

    const downloadBtn = screen.getByText('下载更新')
    await act(async () => { fireEvent.click(downloadBtn) })

    await waitFor(() => {
      expect(mockAnchorClick).toHaveBeenCalled()
      expect(globalThis.URL.createObjectURL).toHaveBeenCalled()
    }, { timeout: 5000 })
  })

  it('fetch 失败 → 回退 window.open', async () => {
    localStorage.setItem('quiz_app_ver', '1.0')
    qFetch(() => Promise.resolve(ver('1.15')))
    qFetch(() => Promise.reject(new Error('network')))

    renderHome()

    await waitFor(() => {
      expect(screen.getByText(/发现新版本/)).toBeTruthy()
    }, { timeout: 5000 })

    const downloadBtn = screen.getByText('下载更新')
    await act(async () => { fireEvent.click(downloadBtn) })

    await waitFor(() => {
      expect(globalThis.open).toHaveBeenCalled()
    }, { timeout: 5000 })
  })

  it('下载前先把版本号写入 localStorage', async () => {
    localStorage.setItem('quiz_app_ver', '1.0')
    qFetch(() => Promise.resolve(ver('1.15')))
    qFetch(() => Promise.resolve(apk()))

    renderHome()

    await waitFor(() => {
      expect(screen.getByText(/发现新版本/)).toBeTruthy()
    }, { timeout: 5000 })

    await act(async () => {
      fireEvent.click(screen.getByText('下载更新'))
    })

    await waitFor(() => {
      expect(localStorage.getItem('quiz_app_ver')).toBe('1.15')
    }, { timeout: 5000 })
  })
})
