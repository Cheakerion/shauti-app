import { useState, useEffect, useCallback, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { getQuestionsByBank, saveAnswerRecord, db } from '../db'
import type { Question, QuizMode, AnswerRecord } from '../types'
import ProgressBar from '../components/ProgressBar'

export default function Quiz() {
  const { bankId } = useParams<{ bankId: string }>()
  const navigate = useNavigate()

  const [questions, setQuestions] = useState<Question[]>([])
  const [currentIndex, setCurrentIndex] = useState(0)
  const [mode, setMode] = useState<QuizMode>('sequential')
  const [selectedAnswer, setSelectedAnswer] = useState<string | null>(null)
  const [pendingAnswer, setPendingAnswer] = useState<string | null>(null)
  const [records, setRecords] = useState<AnswerRecord[]>([])
  const [showComplete, setShowComplete] = useState(false)
  const [startTime, setStartTime] = useState(Date.now())
  const [shuffledIndices, setShuffledIndices] = useState<number[]>([])
  const [allDone, setAllDone] = useState(false)
  const [historyAnswers, setHistoryAnswers] = useState<Map<string, string>>(new Map())
  const [confirmMode, setConfirmMode] = useState(false)
  const [showQuestionList, setShowQuestionList] = useState(false)

  useEffect(() => {
    if (!bankId) return
    getQuestionsByBank(bankId).then((qs) => {
      setQuestions(qs)
      const indices = Array.from({ length: qs.length }, (_, i) => i)
      for (let i = indices.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [indices[i], indices[j]] = [indices[j], indices[i]]
      }
      setShuffledIndices(indices)
    })
  }, [bankId])

  const question = useMemo(() => {
    if (questions.length === 0) return null
    const idx = mode === 'sequential'
      ? currentIndex
      : shuffledIndices[currentIndex]
    return questions[idx] || null
  }, [questions, currentIndex, mode, shuffledIndices])

  useEffect(() => {
    if (question) {
      const existing = historyAnswers.get(question.id)
      setSelectedAnswer(existing || null)
      setPendingAnswer(null)
    }
  }, [currentIndex, mode, shuffledIndices, question?.id])

  // 每道题的答题状态：null=未答, true=正确, false=错误
  const questionStatus = useMemo(() => {
    const map = new Map<string, boolean | null>()
    for (const [qid, ans] of historyAnswers) {
      const q = questions.find(qq => qq.id === qid)
      map.set(qid, q ? ans === q.answer : null)
    }
    return map
  }, [historyAnswers, questions])

  function fullRestart() {
    setCurrentIndex(0)
    setSelectedAnswer(null)
    setPendingAnswer(null)
    setRecords([])
    setHistoryAnswers(new Map())
    setShowComplete(false)
    setAllDone(false)
    setStartTime(Date.now())
    const indices = Array.from({ length: questions.length }, (_, i) => i)
    for (let i = indices.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [indices[i], indices[j]] = [indices[j], indices[i]]
    }
    setShuffledIndices(indices)
  }

  async function clearAndRestart() {
    if (!bankId) return
    if (!confirm('确定清除该题库的所有答题记录？\n当前题库的所有答题记录将从数据库删除，错题本也会被清空。')) return
    await db.answerRecords.where('bankId').equals(bankId).delete()
    fullRestart()
  }

  const handleSelect = useCallback(async (answer: string) => {
    if (!question) return
    if (historyAnswers.has(question.id)) return

    if (confirmMode) {
      setPendingAnswer(answer)
    } else {
      // 即时模式：直接提交
      setSelectedAnswer(answer)
      setPendingAnswer(null)
      const isCorrect = answer === question.answer
      const record: AnswerRecord = {
        questionId: question.id, bankId: question.bankId,
        userAnswer: answer, isCorrect, timestamp: Date.now(),
      }
      setRecords((prev) => [...prev, record])
      setHistoryAnswers((prev) => new Map(prev).set(question.id, answer))
      await saveAnswerRecord(record)
    }
  }, [question, historyAnswers, confirmMode])

  const submitAnswer = useCallback(async () => {
    if (!question || !pendingAnswer) return
    if (historyAnswers.has(question.id)) return
    const answer = pendingAnswer
    setSelectedAnswer(answer)
    setPendingAnswer(null)
    const isCorrect = answer === question.answer
    const record: AnswerRecord = {
      questionId: question.id, bankId: question.bankId,
      userAnswer: answer, isCorrect, timestamp: Date.now(),
    }
    setRecords((prev) => [...prev, record])
    setHistoryAnswers((prev) => new Map(prev).set(question.id, answer))
    await saveAnswerRecord(record)
  }, [question, pendingAnswer, historyAnswers])

  function jumpToQuestion(qIndex: number) {
    setCurrentIndex(qIndex)
    setShowQuestionList(false)
  }

  function prevQuestion() {
    if (currentIndex > 0) setCurrentIndex((i) => i - 1)
  }

  function nextQuestion() {
    if (currentIndex >= questions.length - 1) {
      setAllDone(true)
      setShowComplete(true)
      return
    }
    setCurrentIndex((i) => i + 1)
  }

  const stats = useMemo(() => {
    const total = records.length
    const correct = records.filter((r) => r.isCorrect).length
    return { total, correct, wrong: total - correct }
  }, [records])

  // ---- 完成页 ----
  if (showComplete) {
    const elapsed = Math.floor((Date.now() - startTime) / 1000)
    const minutes = Math.floor(elapsed / 60)
    const seconds = elapsed % 60
    const pct = stats.total > 0 ? Math.round((stats.correct / stats.total) * 100) : 0

    return (
      <div>
        <div className="navbar"><span className="title">刷题完成</span></div>
        <div className="card text-center" style={{ padding: '32px 16px' }}>
          <h2 style={{ marginBottom: 12 }}>🎉 全部完成！</h2>
          <div className={`big-score ${pct >= 60 ? 'good' : 'bad'}`}>{pct}%</div>
          <div className="detail">
            正确 {stats.correct} / 共 {stats.total} 题<br />
            用时 {minutes} 分 {seconds} 秒<br />
            错题 {stats.wrong} 道
          </div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap' }}>
            <button className="btn" onClick={fullRestart}>🔄 重新开始</button>
            <button className="btn btn-outline" onClick={() => navigate(`/wrong/${bankId}`)}>📋 查看错题</button>
            <button className="btn btn-outline" onClick={() => navigate('/')}>🏠 返回首页</button>
          </div>
        </div>
      </div>
    )
  }

  // ---- 刷题主界面 ----
  return (
    <div>
      {/* 导航栏 */}
      <div className="navbar">
        <a className="back" onClick={() => navigate('/')} style={{ cursor: 'pointer' }}>← 返回</a>
        <span className="title">刷题 ({currentIndex + 1}/{questions.length})</span>
        <button className="btn btn-sm btn-outline" onClick={() => setShowQuestionList(true)}>📋</button>
      </div>

      {/* 模式切换 */}
      <div className="mode-toggle">
        <button className={mode === 'sequential' ? 'active' : ''} onClick={() => {
          setMode('sequential'); setCurrentIndex(0); fullRestart()
        }}>顺序刷题</button>
        <button className={mode === 'random' ? 'active' : ''} onClick={() => {
          setMode('random'); setCurrentIndex(0); fullRestart()
        }}>随机刷题</button>
      </div>

      {/* 答题模式 + 重置 */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 12, alignItems: 'center' }}>
        <label style={{ fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
          <input type="checkbox" checked={confirmMode} onChange={(e) => setConfirmMode(e.target.checked)} />
          确认后提交
        </label>
        <div style={{ flex: 1 }} />
        <button className="btn btn-sm btn-outline" onClick={fullRestart}>🔄 重新开始</button>
        <button className="btn btn-sm btn-outline" style={{ color: '#dc2626', borderColor: '#dc2626' }} onClick={clearAndRestart}>🗑 清除记录</button>
      </div>

      <ProgressBar current={currentIndex + (selectedAnswer ? 1 : 0)} total={questions.length} />

      <div className="quiz-stats">
        <span>正确 <span style={{ color: '#16a34a' }}>{stats.correct}</span> 错误 <span style={{ color: '#dc2626' }}>{stats.wrong}</span></span>
        <span className="count">{currentIndex + 1} / {questions.length}</span>
      </div>

      {/* 题目卡片 */}
      {question && (
        <div className="card">
          <div className="stem-text">{question.stem}</div>

          <div className="option-list">
            {question.options.map((opt) => {
              let cls = 'option-btn'
              const answered = historyAnswers.has(question.id)
              if (answered) {
                // 已提交：显示正确/错误
                if (opt.label === question.answer) cls += ' correct'
                else if (opt.label === selectedAnswer && opt.label !== question.answer) cls += ' wrong'
              } else if (confirmMode && pendingAnswer === opt.label) {
                // 确认模式：待提交的高亮
                cls += ' selected'
              }
              return (
                <button
                  key={opt.label}
                  className={cls}
                  onClick={() => handleSelect(opt.label)}
                  disabled={answered}
                >
                  <span className="label">{opt.label}.</span>
                  <span>{opt.text}</span>
                </button>
              )
            })}
          </div>

          {/* 确认模式：提交按钮 */}
          {confirmMode && pendingAnswer !== null && !historyAnswers.has(question.id) && (
            <button className="btn btn-block mt-16" onClick={submitAnswer}>
              提交答案
            </button>
          )}

          {historyAnswers.has(question.id) && question.explanation && (
            <div className="explanation"><strong>解析：</strong>{question.explanation}</div>
          )}
          {historyAnswers.has(question.id) && (
            <div style={{ marginTop: 12, fontWeight: 600, color: selectedAnswer === question.answer ? '#16a34a' : '#dc2626' }}>
              {selectedAnswer === question.answer ? '✅ 正确！' : `❌ 错误！正确答案是 ${question.answer}`}
            </div>
          )}
        </div>
      )}

      {/* 操作按钮 */}
      <div className="quiz-actions">
        <button className="btn btn-outline" disabled={currentIndex === 0} onClick={prevQuestion}>← 上一题</button>
        <button className="btn" style={{ flex: 1 }} onClick={nextQuestion}>
          {allDone ? '查看成绩' : currentIndex >= questions.length - 1 ? '完成' : '下一题 →'}
        </button>
      </div>

      {/* 题号选择弹窗 */}
      {showQuestionList && (
        <div className="modal-overlay" onClick={() => setShowQuestionList(false)}>
          <div className="modal" style={{ maxWidth: 480 }} onClick={(e) => e.stopPropagation()}>
            <h3>选择题目</h3>
            <div className="question-grid">
              {questions.map((_, i) => {
                const q = questions[i]
                const status = questionStatus.get(q.id)
                let dotCls = 'q-dot'
                if (status === true) dotCls += ' q-correct'
                else if (status === false) dotCls += ' q-wrong'
                if (i === currentIndex) dotCls += ' q-current'
                return (
                  <button key={i} className={dotCls} onClick={() => jumpToQuestion(i)}>
                    {i + 1}
                  </button>
                )
              })}
            </div>
            <button className="btn mt-16" onClick={() => setShowQuestionList(false)}>关闭</button>
          </div>
        </div>
      )}
    </div>
  )
}
