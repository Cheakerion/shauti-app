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
// 队列空了返回 reject，让双保险逻辑自动试下一个 URL
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
// 一、自动检测（fetchVersionUrl 双保险）
// ============================================================
describe('autoCheckUpdate', () => {
  it('GitHub 源可用 → 发现新版本 → 显示 banner', async () => {
    localStorage.setItem('quiz_app_ver', '1.0')
    qFetch(() => Promise.resolve(ver('1.15')))  // fetchVersionUrl 第1个URL成功

    renderHome()

    await waitFor(() => {
      expect(screen.getByText(/发现新版本/)).toBeTruthy()
    }, { timeout: 5000 })
  })

  it('GitHub 源失败 → 回退 CDN → 成功', async () => {
    localStorage.setItem('quiz_app_ver', '1.0')
    qFetch(() => Promise.reject(new Error('github down')))   // 第1个URL失败
    qFetch(() => Promise.resolve(ver('1.15')))                // 第2个URL成功

    renderHome()

    await waitFor(() => {
      expect(screen.getByText(/发现新版本/)).toBeTruthy()
    }, { timeout: 5000 })
  })

  it('两个源都挂 → 静默不崩溃', async () => {
    localStorage.setItem('quiz_app_ver', '1.0')
    qFetch(() => Promise.reject(new Error('github down')))
    qFetch(() => Promise.reject(new Error('cdn down')))

    renderHome()
    await new Promise(r => setTimeout(r, 300))
    expect(screen.getByText('📝 刷题')).toBeTruthy()
    expect(screen.queryByText(/发现新版本/)).toBeNull()
  })

  it('版本相同 → 不显示 banner', async () => {
    localStorage.setItem('quiz_app_ver', '1.15')
    qFetch(() => Promise.resolve(ver('1.15')))

    renderHome()
    await new Promise(r => setTimeout(r, 500))
    expect(screen.queryByText(/发现新版本/)).toBeNull()
  })
})

// ============================================================
// 二、手动检测
// ============================================================
describe('checkUpdate', () => {
  it('有新版本 → confirm → 下载', async () => {
    localStorage.setItem('quiz_app_ver', '1.0')
    qFetch(() => Promise.resolve(ver('1.0')))     // 自动检测（返回旧版）
    qFetch(() => Promise.resolve(ver('1.15')))     // 手动检测 fetchVersionUrl
    // confirm 点确定 → handleDownload 被调用
    qFetch(() => Promise.resolve(apk()))           // APK 下载第1个URL

    renderHome()
    await act(async () => { await new Promise(r => setTimeout(r, 200)) })

    const btn = screen.getByText('🔄 检查更新')
    await act(async () => { fireEvent.click(btn) })

    await waitFor(() => {
      expect(globalThis.confirm).toHaveBeenCalled()
      // confirm 返回 true → 调用 handleDownload
    })

    await waitFor(() => {
      expect(mockAnchorClick).toHaveBeenCalled()
    }, { timeout: 5000 })
  })

  it('已是最新 → alert', async () => {
    localStorage.setItem('quiz_app_ver', '1.15')
    qFetch(() => Promise.resolve(ver('1.15')))
    qFetch(() => Promise.resolve(ver('1.15')))

    renderHome()
    await act(async () => { await new Promise(r => setTimeout(r, 200)) })

    const btn = screen.getByText('🔄 检查更新')
    await act(async () => { fireEvent.click(btn) })

    await waitFor(() => {
      expect(globalThis.alert).toHaveBeenCalledWith(expect.stringContaining('已是最新'))
    })
  })

  it('两个源都失败 → 提示检测失败', async () => {
    localStorage.setItem('quiz_app_ver', '1.0')
    qFetch(() => Promise.resolve(ver('1.0')))      // 自动检测
    qFetch(() => Promise.reject(new Error('x')))     // 手动 fetchVersionUrl #1
    qFetch(() => Promise.reject(new Error('x')))     // 手动 fetchVersionUrl #2

    renderHome()
    await act(async () => { await new Promise(r => setTimeout(r, 200)) })

    const btn = screen.getByText('🔄 检查更新')
    await act(async () => { fireEvent.click(btn) })

    await waitFor(() => {
      expect(globalThis.alert).toHaveBeenCalledWith(
        expect.stringContaining('检测失败')
      )
    })
  })
})

// ============================================================
// 三、下载（双 URL）
// ============================================================
describe('handleDownload', () => {
  it('下载成功 → Blob → anchor click', async () => {
    localStorage.setItem('quiz_app_ver', '1.0')
    qFetch(() => Promise.resolve(ver('1.15')))   // auto-check
    qFetch(() => Promise.resolve(apk()))          // APK 第1个URL成功

    renderHome()

    await waitFor(() => {
      expect(screen.getByText(/发现新版本/)).toBeTruthy()
    }, { timeout: 5000 })

    await act(async () => {
      fireEvent.click(screen.getByText('下载更新'))
    })

    await waitFor(() => {
      expect(mockAnchorClick).toHaveBeenCalled()
      expect(globalThis.URL.createObjectURL).toHaveBeenCalled()
    }, { timeout: 5000 })
  })

  it('第1个APK源失败 → 回退第2个', async () => {
    localStorage.setItem('quiz_app_ver', '1.0')
    qFetch(() => Promise.resolve(ver('1.15')))     // auto-check
    qFetch(() => Promise.reject(new Error('x')))     // APK URL #1 fail
    qFetch(() => Promise.resolve(apk()))            // APK URL #2 success

    renderHome()

    await waitFor(() => {
      expect(screen.getByText(/发现新版本/)).toBeTruthy()
    }, { timeout: 5000 })

    await act(async () => {
      fireEvent.click(screen.getByText('下载更新'))
    })

    await waitFor(() => {
      expect(mockAnchorClick).toHaveBeenCalled()
    }, { timeout: 5000 })
  })

  it('两个APK源都失败 → window.open 兜底', async () => {
    localStorage.setItem('quiz_app_ver', '1.0')
    qFetch(() => Promise.resolve(ver('1.15')))
    qFetch(() => Promise.reject(new Error('x')))
    qFetch(() => Promise.reject(new Error('x')))

    renderHome()

    await waitFor(() => {
      expect(screen.getByText(/发现新版本/)).toBeTruthy()
    }, { timeout: 5000 })

    await act(async () => {
      fireEvent.click(screen.getByText('下载更新'))
    })

    await waitFor(() => {
      expect(globalThis.open).toHaveBeenCalled()
    }, { timeout: 5000 })
  })

  it('下载前写入 localStorage', async () => {
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
