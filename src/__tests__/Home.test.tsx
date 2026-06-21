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
// atob for GitHub API base64 decode
globalThis.atob = vi.fn((s: string) => Buffer.from(s, 'base64').toString('utf-8'))

const verJson = (v: string) => ({ ok: true, status: 200, json: async () => ({ version: v }) })
const ghApiVer = (v: string) => ({
  ok: true, status: 200,
  json: async () => ({ content: Buffer.from(JSON.stringify({ version: v })).toString('base64'), encoding: 'base64' }),
})
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
describe('autoCheckUpdate — fetchVersionUrl', () => {
  it('GitHub API 可用 → 发现新版本', async () => {
    localStorage.setItem('quiz_app_ver', '1.0')
    qFetch(() => Promise.resolve(ghApiVer('1.17')))  // API 成功，不再试后面

    renderHome()

    await waitFor(() => {
      expect(screen.getByText(/发现新版本/)).toBeTruthy()
    }, { timeout: 5000 })
  })

  it('API 失败 → raw 成功', async () => {
    localStorage.setItem('quiz_app_ver', '1.0')
    qFetch(() => Promise.reject(new Error('api down')))
    qFetch(() => Promise.resolve(verJson('1.17')))

    renderHome()

    await waitFor(() => {
      expect(screen.getByText(/发现新版本/)).toBeTruthy()
    }, { timeout: 5000 })
  })

  it('API + raw 都失败 → CDN 兜底成功', async () => {
    localStorage.setItem('quiz_app_ver', '1.0')
    qFetch(() => Promise.reject(new Error('api')))
    qFetch(() => Promise.reject(new Error('raw')))
    qFetch(() => Promise.resolve(verJson('1.17')))

    renderHome()

    await waitFor(() => {
      expect(screen.getByText(/发现新版本/)).toBeTruthy()
    }, { timeout: 5000 })
  })

  it('三个源全挂 → 静默', async () => {
    localStorage.setItem('quiz_app_ver', '1.0')
    qFetch(() => Promise.reject(new Error('api')))
    qFetch(() => Promise.reject(new Error('raw')))
    qFetch(() => Promise.reject(new Error('cdn')))

    renderHome()
    await new Promise(r => setTimeout(r, 300))
    expect(screen.queryByText(/发现新版本/)).toBeNull()
  })

  it('版本相同 → 不显示', async () => {
    localStorage.setItem('quiz_app_ver', '1.17')
    qFetch(() => Promise.resolve(ghApiVer('1.17')))

    renderHome()
    await new Promise(r => setTimeout(r, 500))
    expect(screen.queryByText(/发现新版本/)).toBeNull()
  })
})

// ============================================================
// 二、手动检测
// ============================================================
describe('checkUpdate', () => {
  it('GitHub API 通常可用 → 发现新版本 → confirm → 下载', async () => {
    localStorage.setItem('quiz_app_ver', '1.0')
    qFetch(() => Promise.resolve(ghApiVer('1.0')))       // auto: API ok
    qFetch(() => Promise.resolve(ghApiVer('1.17')))       // manual: API ok
    qFetch(() => Promise.resolve(apk()))                  // download APK #1

    renderHome()
    await act(async () => { await new Promise(r => setTimeout(r, 200)) })

    await act(async () => { fireEvent.click(screen.getByText('🔄 检查更新')) })

    await waitFor(() => {
      expect(globalThis.confirm).toHaveBeenCalled()
      expect(mockAnchorClick).toHaveBeenCalled()
    }, { timeout: 5000 })
  })

  it('API 失败 raw 成功 → 仍能检测', async () => {
    localStorage.setItem('quiz_app_ver', '1.0')
    qFetch(() => Promise.resolve(ghApiVer('1.0')))       // auto: API ok
    qFetch(() => Promise.reject(new Error('api')))         // manual: API fail
    qFetch(() => Promise.resolve(verJson('1.17')))         // manual: raw ok
    qFetch(() => Promise.resolve(apk()))                  // download

    renderHome()
    await act(async () => { await new Promise(r => setTimeout(r, 200)) })

    await act(async () => { fireEvent.click(screen.getByText('🔄 检查更新')) })

    await waitFor(() => {
      expect(mockAnchorClick).toHaveBeenCalled()
    }, { timeout: 5000 })
  })

  it('全挂 → 提示检测失败', async () => {
    localStorage.setItem('quiz_app_ver', '1.0')
    qFetch(() => Promise.resolve(ghApiVer('1.0')))       // auto
    qFetch(() => Promise.reject(new Error('x')))          // manual api
    qFetch(() => Promise.reject(new Error('x')))          // manual raw
    qFetch(() => Promise.reject(new Error('x')))          // manual cdn

    renderHome()
    await act(async () => { await new Promise(r => setTimeout(r, 200)) })

    await act(async () => { fireEvent.click(screen.getByText('🔄 检查更新')) })

    await waitFor(() => {
      expect(globalThis.alert).toHaveBeenCalledWith(expect.stringContaining('检测失败'))
    })
  })
})

// ============================================================
// 三、下载
// ============================================================
describe('handleDownload', () => {
  it('正常下载', async () => {
    localStorage.setItem('quiz_app_ver', '1.0')
    qFetch(() => Promise.resolve(ghApiVer('1.17')))  // auto
    qFetch(() => Promise.resolve(apk()))               // APK

    renderHome()

    await waitFor(() => {
      expect(screen.getByText(/发现新版本/)).toBeTruthy()
    }, { timeout: 5000 })

    await act(async () => { fireEvent.click(screen.getByText('下载更新')) })

    await waitFor(() => {
      expect(mockAnchorClick).toHaveBeenCalled()
      expect(localStorage.getItem('quiz_app_ver')).toBe('1.17')
    }, { timeout: 5000 })
  })

  it('第1个APK源失败 → 第2个成功', async () => {
    localStorage.setItem('quiz_app_ver', '1.0')
    qFetch(() => Promise.resolve(ghApiVer('1.17')))
    qFetch(() => Promise.reject(new Error('x')))
    qFetch(() => Promise.resolve(apk()))

    renderHome()

    await waitFor(() => {
      expect(screen.getByText(/发现新版本/)).toBeTruthy()
    }, { timeout: 5000 })

    await act(async () => { fireEvent.click(screen.getByText('下载更新')) })

    await waitFor(() => {
      expect(mockAnchorClick).toHaveBeenCalled()
    }, { timeout: 5000 })
  })

  it('两个APK源都失败 → window.open 兜底', async () => {
    localStorage.setItem('quiz_app_ver', '1.0')
    qFetch(() => Promise.resolve(ghApiVer('1.17')))
    qFetch(() => Promise.reject(new Error('x')))
    qFetch(() => Promise.reject(new Error('x')))

    renderHome()

    await waitFor(() => {
      expect(screen.getByText(/发现新版本/)).toBeTruthy()
    }, { timeout: 5000 })

    await act(async () => { fireEvent.click(screen.getByText('下载更新')) })

    await waitFor(() => {
      expect(globalThis.open).toHaveBeenCalled()
    }, { timeout: 5000 })
  })
})
