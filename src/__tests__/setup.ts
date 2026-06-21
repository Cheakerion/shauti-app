// 全局 Mock：浏览器 API
import { vi } from 'vitest'

// localStorage
const store = new Map<string, string>()
globalThis.localStorage = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => { store.set(k, v) },
  removeItem: (k: string) => { store.delete(k) },
  clear: () => { store.clear() },
  get length() { return store.size },
  key: (i: number) => [...store.keys()][i] ?? null,
} as any

// URL.createObjectURL / revokeObjectURL
globalThis.URL.createObjectURL = vi.fn(() => 'blob:mock-url')
globalThis.URL.revokeObjectURL = vi.fn()

// window.open
globalThis.open = vi.fn()
globalThis.window = globalThis as any
