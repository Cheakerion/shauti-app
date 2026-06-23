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
// 一、版本显示：lag 差值
// ============================================================
describe('差值显示', () => {
  it('已是最新：installed=2 latest=2 → 已是最新', async () => {
    localStorage.setItem('quiz_app_ver', '1.88')
    localStorage.setItem('quiz_app_update', '2')
    localStorage.setItem('quiz_latest_update', '2')
    renderHome()

    await waitFor(() => {
      expect(screen.getByText(/已是最新/)).toBeTruthy()
    }, { timeout: 3000 })
  })

  it('落后 1 个：installed=1 latest=2 → 落后 1 个更新', async () => {
    localStorage.setItem('quiz_app_ver', '1.87')
    localStorage.setItem('quiz_app_update', '1')
    localStorage.setItem('quiz_latest_update', '2')
    renderHome()

    await waitFor(() => {
      expect(screen.getByText(/落后 1 个更新/)).toBeTruthy()
    }, { timeout: 3000 })
  })

  it('无 installed → 默认 0，lag=latest', async () => {
    localStorage.setItem('quiz_latest_update', '3')
    renderHome()

    await waitFor(() => {
      expect(screen.getByText(/落后 3 个更新/)).toBeTruthy()
    }, { timeout: 3000 })
  })
})

// ============================================================
// 二、手动检查更新（走 quiz://check-update）
// ============================================================
describe('checkUpdate', () => {
  it('点检查更新 → 不崩溃', async () => {
    renderHome()
    await act(async () => { await new Promise(r => setTimeout(r, 200)) })
    await act(async () => { fireEvent.click(screen.getByText('🔄 检查更新')) })
    expect(screen.getByText('📝 刷题')).toBeTruthy()
  })
})

// ============================================================
// 三、更新成功横幅
// ============================================================
describe('updateSuccess', () => {
  it('启动时检测到 pending → 显示更新成功', async () => {
    localStorage.setItem('quiz_pending_update', '1.88')
    renderHome()

    await waitFor(() => {
      expect(screen.getByText(/已更新到 v1.88/)).toBeTruthy()
    }, { timeout: 2000 })
  })
})
