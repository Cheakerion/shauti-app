// ============================================================
// 数据库操作测试
// ============================================================
import { describe, it, expect, beforeAll } from 'vitest'
import 'fake-indexeddb/auto'
import {
  db,
  saveBank,
  deleteBank,
  getAllBanks,
  getQuestionsByBank,
  getQuestionCount,
  saveAnswerRecord,
  getWrongQuestionIds,
  getWrongQuestions,
} from '../db'
import type { QuestionBank, Question, AnswerRecord } from '../types'

const testBank: QuestionBank = {
  id: 'test-bank-1',
  title: '测试题库',
  fileName: 'test.md',
  totalCount: 3,
  createdAt: Date.now(),
}

const testQuestions: Question[] = [
  {
    id: 'q1',
    bankId: 'test-bank-1',
    index: 1,
    type: 'choice',
    stem: '第一题题干',
    options: [
      { label: 'A', text: '选项A' },
      { label: 'B', text: '选项B' },
      { label: 'C', text: '选项C' },
      { label: 'D', text: '选项D' },
    ],
    answer: 'B',
    explanation: '第一题解析',
  },
  {
    id: 'q2',
    bankId: 'test-bank-1',
    index: 2,
    type: 'explain',
    stem: '第二题：解释XX概念',
    options: [],
    answer: 'XX是指...',
    explanation: '第二题解析',
  },
  {
    id: 'q3',
    bankId: 'test-bank-1',
    index: 3,
    type: 'short_answer',
    stem: '第三题：简述YY',
    options: [],
    answer: 'YY的特点有...',
  },
]

describe('题库操作', () => {
  it('保存题库成功', async () => {
    await saveBank(testBank, testQuestions)

    const banks = await getAllBanks()
    expect(banks.length).toBe(1)
    expect(banks[0].title).toBe('测试题库')
    expect(banks[0].totalCount).toBe(3)
  })

  it('按ID取题目，按index排序', async () => {
    const questions = await getQuestionsByBank('test-bank-1')
    expect(questions.length).toBe(3)
    expect(questions[0].index).toBe(1)
    expect(questions[1].index).toBe(2)
    expect(questions[2].index).toBe(3)
  })

  it('题目数量正确', async () => {
    const count = await getQuestionCount('test-bank-1')
    expect(count).toBe(3)
  })
})

describe('答题记录', () => {
  it('保存答题记录', async () => {
    const record: AnswerRecord = {
      questionId: 'q1',
      bankId: 'test-bank-1',
      userAnswer: 'B',
      isCorrect: true,
      timestamp: Date.now(),
    }
    await saveAnswerRecord(record)

    // 答错第二题
    const wrongRecord: AnswerRecord = {
      questionId: 'q2',
      bankId: 'test-bank-1',
      userAnswer: '自评: 错误',
      isCorrect: false,
      timestamp: Date.now(),
    }
    await saveAnswerRecord(wrongRecord)
  })

  it('获取错题ID列表', async () => {
    const wrongIds = await getWrongQuestionIds('test-bank-1')
    expect(wrongIds.length).toBe(1)
    expect(wrongIds[0]).toBe('q2')
  })

  it('获取错题完整内容', async () => {
    const wrongQs = await getWrongQuestions('test-bank-1')
    expect(wrongQs.length).toBe(1)
    expect(wrongQs[0].id).toBe('q2')
    expect(wrongQs[0].stem).toContain('解释XX')
  })

  it('没有答题记录的题库返回空错题', async () => {
    const wrongIds = await getWrongQuestionIds('nonexistent')
    expect(wrongIds.length).toBe(0)
  })
})

describe('删除题库', () => {
  it('级联删除：题库、题目、答题记录一起删', async () => {
    await deleteBank('test-bank-1')

    const banks = await getAllBanks()
    expect(banks.length).toBe(0)

    const questions = await getQuestionsByBank('test-bank-1')
    expect(questions.length).toBe(0)

    const wrongIds = await getWrongQuestionIds('test-bank-1')
    expect(wrongIds.length).toBe(0)
  })
})
