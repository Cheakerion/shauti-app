import { useState, useEffect, useRef, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { getWrongQuestions, getQuestionCount, saveAnswerRecord, db } from '../db'
import type { Question, AnswerRecord } from '../types'
import ProgressBar from '../components/ProgressBar'

export default function WrongBook() {
  const { bankId } = useParams<{ bankId: string }>()
  const navigate = useNavigate()

  const [wrongQuestions, setWrongQuestions] = useState<Question[]>([])
  const [totalCount, setTotalCount] = useState(0)
  const [currentIndex, setCurrentIndex] = useState(0)
  const [selectedAnswer, setSelectedAnswer] = useState<string | null>(null)
  const [showComplete, setShowComplete] = useState(false)
  const [showGrid, setShowGrid] = useState(false)
  const touchStartX = useRef(0)
  const touchStartY = useRef(0)

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX
    touchStartY.current = e.touches[0].clientY
  }, [])
  const handleTouchEnd = useCallback((e: React.TouchEvent) => {
    const dx = e.changedTouches[0].clientX - touchStartX.current
    const dy = e.changedTouches[0].clientY - touchStartY.current
    if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 50) {
      if (dx < 0) nextQuestion()
      else prevQuestion()
    }
  }, [currentIndex, wrongQuestions.length])

  useEffect(() => {
    if (!bankId) return
    Promise.all([
      getWrongQuestions(bankId),
      getQuestionCount(bankId),
    ]).then(([qs, total]) => {
      setWrongQuestions(qs)
      setTotalCount(total)
    })
  }, [bankId])

  const question = wrongQuestions[currentIndex] || null

  async function handleSelect(answer: string) {
    if (selectedAnswer !== null || !question) return
    setSelectedAnswer(answer)

    const isCorrect = answer === question.answer
    const record: AnswerRecord = {
      questionId: question.id,
      bankId: question.bankId,
      userAnswer: answer,
      isCorrect,
      timestamp: Date.now(),
    }
    await saveAnswerRecord(record)
  }

  async function clearAllWrong() {
    if (!bankId) return
    if (!confirm('确定清空该题库的所有错题记录？\n所有答题记录将被删除，无法恢复。')) return
    await db.answerRecords.where('bankId').equals(bankId).delete()
    setWrongQuestions([])
    setShowComplete(false)
  }

  function refreshWrong() {
    if (!bankId) return
    getWrongQuestions(bankId).then(qs => {
      setWrongQuestions(qs)
      setCurrentIndex(0)
      setSelectedAnswer(null)
      setShowComplete(false)
    })
  }

  function prevQuestion() {
    if (currentIndex > 0) {
      setCurrentIndex((i) => i - 1)
      setSelectedAnswer(null)
    }
  }

  function nextQuestion() {
    if (currentIndex >= wrongQuestions.length - 1) {
      setShowComplete(true)
      return
    }
    setCurrentIndex((i) => i + 1)
    setSelectedAnswer(null)
  }

  const doneCount = currentIndex + (selectedAnswer !== null ? 1 : 0)

  // 空状态
  if (wrongQuestions.length === 0) {
    return (
      <div>
        <div className="navbar">
          <a className="back" onClick={() => navigate('/')} style={{ cursor: 'pointer' }}>
            ← 返回
          </a>
          <span className="title">错题本</span>
        </div>
        <div className="empty-state">
          <div className="icon">🎉</div>
          <h3>没有错题</h3>
          <p>太棒了，全部正确！（或还未做过题）</p>
          {totalCount > 0 && (
            <button
              className="btn mt-16"
              onClick={() => navigate(`/quiz/${bankId}`)}
            >
              去刷题
            </button>
          )}
        </div>
      </div>
    )
  }

  // 完成页
  if (showComplete) {
    return (
      <div>
        <div className="navbar">
          <span className="title">错题复习完成</span>
        </div>
        <div className="card text-center" style={{ padding: '32px 16px' }}>
          <h2>✅ 错题复习完毕</h2>
          <div className="detail" style={{ marginTop: 12 }}>
            共复习 {wrongQuestions.length} 道错题
          </div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginTop: 16, flexWrap: 'wrap' }}>
            <button
              className="btn"
              onClick={() => {
                setCurrentIndex(0)
                setSelectedAnswer(null)
                setShowComplete(false)
              }}
            >
              🔄 再练一次
            </button>
            <button
              className="btn btn-outline"
              onClick={() => navigate('/')}
            >
              🏠 返回首页
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div>
      {/* 导航栏 */}
      <div className="navbar">
        <a className="back" onClick={() => navigate('/')} style={{ cursor: 'pointer' }}>
          ← 返回
        </a>
        <span className="title">
          错题本 ({doneCount}/{wrongQuestions.length})
        </span>
        <button className="btn btn-sm btn-outline" onClick={() => setShowGrid(true)}>📋</button>
      </div>

      {/* 进度条 */}
      <ProgressBar current={doneCount} total={wrongQuestions.length} />

      {/* 统计 */}
      <div className="quiz-stats">
        <span>
          共 <span style={{ color: '#dc2626' }}>{wrongQuestions.length}</span> 道错题
        </span>
        <span className="count">
          {currentIndex + 1} / {wrongQuestions.length}
        </span>
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        <button className="btn btn-sm btn-outline" onClick={refreshWrong}>🔄 刷新错题</button>
        <button className="btn btn-sm btn-outline" style={{ color: '#dc2626', borderColor: '#dc2626' }} onClick={clearAllWrong}>🗑 清空错题</button>
      </div>

      {/* 题目卡片 */}
      {question && (
        <div className="card" onTouchStart={handleTouchStart} onTouchEnd={handleTouchEnd}
          style={{ touchAction: 'pan-y' }}>
          <div className="stem-text">{question.stem}</div>

          <div className="option-list">
            {question.options.map((opt) => {
              let cls = 'option-btn'
              if (selectedAnswer !== null) {
                if (opt.label === question.answer) {
                  cls += ' correct'
                } else if (opt.label === selectedAnswer && opt.label !== question.answer) {
                  cls += ' wrong'
                }
              }
              return (
                <button
                  key={opt.label}
                  className={cls}
                  onClick={() => handleSelect(opt.label)}
                  disabled={selectedAnswer !== null}
                >
                  <span className="label">{opt.label}.</span>
                  <span>{opt.text}</span>
                </button>
              )
            })}
          </div>

          {selectedAnswer !== null && question.explanation && (
            <div className="explanation">
              <strong>解析：</strong>{question.explanation}
            </div>
          )}

          {selectedAnswer !== null && (
            <div
              style={{
                marginTop: 12,
                fontWeight: 600,
                color: selectedAnswer === question.answer ? '#16a34a' : '#dc2626',
              }}
            >
              {selectedAnswer === question.answer
                ? '✅ 正确！'
                : `❌ 错误！正确答案是 ${question.answer}`}
            </div>
          )}
        </div>
      )}

      {/* 操作按钮 */}
      <div className="quiz-actions">
        <button
          className="btn btn-outline"
          disabled={currentIndex === 0}
          onClick={prevQuestion}
        >
          ← 上一题
        </button>
        <button
          className="btn"
          style={{ flex: 1 }}
          disabled={selectedAnswer === null}
          onClick={nextQuestion}
        >
          {currentIndex >= wrongQuestions.length - 1 ? '完成' : '下一题 →'}
        </button>
      </div>

      {/* Question grid */}
      {showGrid && (
        <div className="modal-overlay" onClick={() => setShowGrid(false)}>
          <div className="modal" style={{ maxWidth: 480 }} onClick={(e) => e.stopPropagation()}>
            <h3>选择题目</h3>
            <div className="question-grid">
              {wrongQuestions.map((q, i) => {
                let cls = 'q-dot'
                if (i === currentIndex) cls += ' q-current'
                return (
                  <button key={q.id} className={cls} onClick={() => {
                    setCurrentIndex(i)
                    setSelectedAnswer(null)
                    setShowGrid(false)
                  }}>
                    {i + 1}
                  </button>
                )
              })}
            </div>
            <button className="btn mt-16" onClick={() => setShowGrid(false)}>关闭</button>
          </div>
        </div>
      )}
    </div>
  )
}
