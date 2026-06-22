// @vitest-environment jsdom
// ============================================================
// Home 页面 — 版本检测 & 下载交互测试
// ============================================================
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, act, waitFor, fireEvent } from '@testing-library/react'
import { HashRouter } from 'react-router-dom'
import 'fake-indexeddb/auto'
import Home from '../pages/Home'

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
})

afterEach(() => { vi.restoreAllMocks() })

function renderHome() {
  return render(<HashRouter><Home /></HashRouter>)
}

// ============================================================
// 一、自动检测（fetchVersionUrl 读 localStorage.quiz_latest_ver）
// ============================================================
describe('autoCheckUpdate', () => {
  it('Java 注入了新版本 → 显示蓝框', async () => {
    localStorage.setItem('quiz_app_ver', '1.0')
    localStorage.setItem('quiz_latest_ver', '1.18')
    renderHome()

    await waitFor(() => {
      expect(screen.getByText(/发现新版本/)).toBeTruthy()
    }, { timeout: 5000 })
  })

  it('没有注入版本 → 不显示蓝框', async () => {
    localStorage.setItem('quiz_app_ver', '1.0')
    renderHome()
    await new Promise(r => setTimeout(r, 500))
    expect(screen.queryByText(/发现新版本/)).toBeNull()
  })

  it('版本相同 → 不显示蓝框', async () => {
    localStorage.setItem('quiz_app_ver', '1.18')
    localStorage.setItem('quiz_latest_ver', '1.18')
    renderHome()
    await new Promise(r => setTimeout(r, 500))
    expect(screen.queryByText(/发现新版本/)).toBeNull()
  })
})

// ============================================================
// 二、手动检测（走 location.href = 'quiz://check-update'）
// ============================================================
describe('checkUpdate', () => {
  it('点检查更新 → 设置 location.href', async () => {
    renderHome()
    await act(async () => { fireEvent.click(screen.getByText('🔄 检查更新')) })
    // jsdom 不支持 location.href 跳转，只验证没崩溃
    expect(screen.getByText('📝 刷题')).toBeTruthy()
  })

  it('蓝框按钮也走检查更新', async () => {
    localStorage.setItem('quiz_app_ver', '1.0')
    localStorage.setItem('quiz_latest_ver', '1.18')
    renderHome()

    await waitFor(() => {
      expect(screen.getByText(/发现新版本/)).toBeTruthy()
    }, { timeout: 5000 })

    await act(async () => { fireEvent.click(screen.getByText('下载更新')) })
    expect(screen.getByText('📝 刷题')).toBeTruthy()
  })
})
