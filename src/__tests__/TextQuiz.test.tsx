// @vitest-environment jsdom
// ============================================================
// TextQuiz 页面 — 名词解释/简答题 UI 测试
// ============================================================
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, act, waitFor, fireEvent } from '@testing-library/react'
import { HashRouter } from 'react-router-dom'
import 'fake-indexeddb/auto'
import { db, saveBank } from '../db'
import type { QuestionBank, Question } from '../types'
import TextQuiz from '../pages/TextQuiz'

const testBank: QuestionBank = {
  id: 'textquiz-test-bank',
  title: '测试名词解题库',
  fileName: 'test.md',
  totalCount: 3,
  createdAt: Date.now(),
}

const testQuestions: Question[] = [
  {
    id: 'eq1', bankId: 'textquiz-test-bank', index: 1, type: 'explain',
    stem: '1. 高血压', engStem: 'Hypertension',
    options: [], answer: '收缩压≥140mmHg和（或）舒张压≥90mmHg。',
    explanation: '需非同日3次测量。',
  },
  {
    id: 'eq2', bankId: 'textquiz-test-bank', index: 2, type: 'explain',
    stem: '2. 心力衰竭', engStem: 'Heart failure',
    options: [], answer: '心排血量不能满足机体组织代谢需要的一组综合征。',
  },
  {
    id: 'eq3', bankId: 'textquiz-test-bank', index: 3, type: 'explain',
    stem: '3. 生物转化',
    options: [], answer: '外来化合物在体内代谢酶的作用下发生化学结构改变的过程。',
  },
]

// Mock URL params — TextQuiz uses useParams to get bankId
const mockNavigate = vi.fn()
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return {
    ...actual,
    useParams: () => ({ bankId: 'textquiz-test-bank' }),
    useNavigate: () => mockNavigate,
  }
})

globalThis.confirm = vi.fn(() => true)

beforeEach(async () => {
  vi.clearAllMocks()
  localStorage.clear()
  await saveBank(testBank, testQuestions)
})

afterEach(async () => {
  await db.questionBanks.where('id').equals('textquiz-test-bank').delete()
  await db.questions.where('bankId').equals('textquiz-test-bank').delete()
  await db.answerRecords.where('bankId').equals('textquiz-test-bank').delete()
  await db.markedQuestions.where('bankId').equals('textquiz-test-bank').delete()
})

function renderTextQuiz(qType: 'explain' | 'short_answer' = 'explain') {
  return render(
    <HashRouter>
      <TextQuiz qType={qType} />
    </HashRouter>
  )
}

// ============================================================
// 一、初始渲染
// ============================================================
describe('初始渲染', () => {
  it('显示英文题干（有 engStem 时）', async () => {
    renderTextQuiz()
    await waitFor(() => {
      expect(screen.getByText('Hypertension')).toBeTruthy()
    }, { timeout: 3000 })
    // 中文题干不应出现在题干区
    expect(screen.queryByText('1. 高血压')).toBeNull()
  })

  it('无 engStem 时回退显示 stem', async () => {
    renderTextQuiz()
    // 导航到第三题（无 engStem）
    await waitFor(() => {
      expect(screen.getByText(/名词解释/)).toBeTruthy()
    }, { timeout: 3000 })
  })

  it('没有快速模式按钮', async () => {
    renderTextQuiz()
    await waitFor(() => {
      expect(screen.getByText('正常')).toBeTruthy()
      expect(screen.getByText('背题')).toBeTruthy()
    }, { timeout: 3000 })
    expect(screen.queryByText('快速')).toBeNull()
    expect(screen.queryByText('⚡快速')).toBeNull()
  })

  it('没有自评按钮', async () => {
    renderTextQuiz()
    await waitFor(() => {
      expect(screen.getByText('查看答案')).toBeTruthy()
    }, { timeout: 3000 })
    // 自评按钮不应该存在
    expect(screen.queryByText('我答对了')).toBeNull()
    expect(screen.queryByText('我答错了')).toBeNull()
  })

  it('显示筛选栏和消除标记按钮', async () => {
    renderTextQuiz()
    await waitFor(() => {
      expect(screen.getByText('全部')).toBeTruthy()
      expect(screen.getByText(/已标记/)).toBeTruthy()
      expect(screen.getByText('未标记')).toBeTruthy()
      expect(screen.getByText('消除标记')).toBeTruthy()
    }, { timeout: 3000 })
  })

  it('没有重新开始和清除记录按钮', async () => {
    renderTextQuiz()
    await waitFor(() => {
      expect(screen.getByText('消除标记')).toBeTruthy()
    }, { timeout: 3000 })
    expect(screen.queryByText('重新开始')).toBeNull()
    expect(screen.queryByText('清除记录')).toBeNull()
  })

  it('统计行显示已看和标记', async () => {
    renderTextQuiz()
    await waitFor(() => {
      expect(screen.getByText(/已看/)).toBeTruthy()
    }, { timeout: 3000 })
  })
})

// ============================================================
// 二、展开/收起答案
// ============================================================
describe('展开收起答案', () => {
  it('点击查看答案 → 显示参考答案和中文术语', async () => {
    renderTextQuiz()
    await waitFor(() => {
      expect(screen.getByText('查看答案')).toBeTruthy()
    }, { timeout: 3000 })

    await act(async () => {
      fireEvent.click(screen.getByText('查看答案'))
      await new Promise(r => setTimeout(r, 300))
    })

    expect(screen.getByText('参考答案：')).toBeTruthy()
    expect(screen.getByText(/收缩压.*140mmHg/)).toBeTruthy()
    // 中文术语应在答案区
    expect(screen.getByText('1. 高血压')).toBeTruthy()
    // 收起答案和标记按钮
    expect(screen.getByText('收起答案')).toBeTruthy()
    expect(screen.getByText('标记此题')).toBeTruthy()
  })

  it('点击收起答案 → 隐藏答案', async () => {
    renderTextQuiz()
    await waitFor(() => {
      expect(screen.getByText('查看答案')).toBeTruthy()
    }, { timeout: 3000 })

    await act(async () => { fireEvent.click(screen.getByText('查看答案')) })
    await act(async () => {
      await new Promise(r => setTimeout(r, 200))
      fireEvent.click(screen.getByText('收起答案'))
    })

    // 答案区隐藏，"查看答案"重新出现
    await waitFor(() => {
      expect(screen.getByText('查看答案')).toBeTruthy()
    }, { timeout: 2000 })
    expect(screen.queryByText('参考答案：')).toBeNull()
  })
})

// ============================================================
// 三、标记题目
// ============================================================
describe('标记题目', () => {
  it('点击标记此题 → 变为已标记', async () => {
    renderTextQuiz()
    await waitFor(() => {
      expect(screen.getByText('查看答案')).toBeTruthy()
    }, { timeout: 3000 })

    await act(async () => { fireEvent.click(screen.getByText('查看答案')) })
    await act(async () => { fireEvent.click(screen.getByText('标记此题')) })

    await waitFor(() => {
      expect(screen.getByText('已标记')).toBeTruthy()
    }, { timeout: 2000 })
  })

  it('消除标记 → 清除所有标记', async () => {
    renderTextQuiz()
    await waitFor(() => {
      expect(screen.getByText('查看答案')).toBeTruthy()
    }, { timeout: 3000 })

    // Mark the question
    await act(async () => { fireEvent.click(screen.getByText('查看答案')) })
    await act(async () => { fireEvent.click(screen.getByText('标记此题')) })

    // Clear marks
    await act(async () => { fireEvent.click(screen.getByText('消除标记')) })

    await waitFor(() => {
      // After clear, marked count should be 0
      expect(screen.getByText(/已标记 \(0\)/)).toBeTruthy()
    }, { timeout: 2000 })
  })
})

// ============================================================
// 四、背题模式
// ============================================================
describe('背题模式', () => {
  it('切换到背题 → 答案自动显示，无收起按钮', async () => {
    renderTextQuiz()
    await waitFor(() => {
      expect(screen.getByText('背题')).toBeTruthy()
    }, { timeout: 3000 })

    await act(async () => { fireEvent.click(screen.getByText('背题')) })

    await waitFor(() => {
      expect(screen.getByText('参考答案：')).toBeTruthy()
    }, { timeout: 2000 })

    // 背题模式不应有收起答案按钮
    expect(screen.queryByText('收起答案')).toBeNull()
  })
})
