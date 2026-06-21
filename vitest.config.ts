import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    // 测试文件位置
    include: ['src/__tests__/**/*.test.ts'],
    // 测试环境
    environment: 'node',
    // 全局设置
    globals: true,
  },
})
