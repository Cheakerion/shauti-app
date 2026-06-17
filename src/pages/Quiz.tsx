import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { getQuestionsByBank, saveAnswerRecord, db } from '../db'
import type { Question, QuizMode, AnswerRecord } from '../types'
import ProgressBar from '../components/ProgressBar'

type PlayMode = 'quick' | 'normal' | 'memorize'

export default function Quiz() {
  const { bankId } = useParams<{ bankId: string }>()
  const navigate = useNavigate()

  const [questions, setQuestions] = useState<Question[]>([])
  const [currentIndex, setCurrentIndex] = useState(0)
  const [mode, setMode] = useState<QuizMode>('sequential')
  const [playMode, setPlayMode] = useState<PlayMode>('normal')
  const [selectedAnswer, setSelectedAnswer] = useState<string | null>(null)
  const [pendingAnswer, setPendingAnswer] = useState<string | null>(null)
  const [records, setRecords] = useState<AnswerRecord[]>([])
  const [showComplete, setShowComplete] = useState(false)
  const [startTime, setStartTime] = useState(Date.now())
  const [shuffledIndices, setShuffledIndices] = useState<number[]>([])
  const [allDone, setAllDone] = useState(false)
  const [historyAnswers, setHistoryAnswers] = useState<Map<string, string>>(new Map())
  const [showQuestionList, setShowQuestionList] = useState(false)
  const [autoAdvancing, setAutoAdvancing] = useState(false)
  const touchStartX = useRef(0)
  const touchStartY = useRef(0)
  const autoAdvTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const sessionKey = `quiz_session_${bankId}`

  useEffect(() => {
    if (!bankId) return
    getQuestionsByBank(bankId).then((qs) => {
      setQuestions(qs)
      const saved = localStorage.getItem(sessionKey)
      if (saved) {
        try {
          const s = JSON.parse(saved)
          setCurrentIndex(s.currentIndex || 0)
          setMode(s.mode || 'sequential')
          setPlayMode(s.playMode || 'normal')
          setShuffledIndices(s.shuffledIndices || [])
          setStartTime(s.startTime || Date.now())
          if (s.historyAnswers) setHistoryAnswers(new Map(Object.entries(s.historyAnswers)))
          return
        } catch (e) {}
      }
      const indices = Array.from({ length: qs.length }, (_, i) => i)
      for (let i = indices.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [indices[i], indices[j]] = [indices[j], indices[i]]
      }
      setShuffledIndices(indices)
    })
  }, [bankId])

  useEffect(() => {
    if (!bankId || questions.length === 0) return
    localStorage.setItem(sessionKey, JSON.stringify({
      currentIndex, mode, playMode, shuffledIndices, startTime,
      historyAnswers: Object.fromEntries(historyAnswers),
    }))
  }, [currentIndex, mode, playMode, historyAnswers, shuffledIndices, startTime, bankId, questions.length])

  // Cleanup auto-advance timer on unmount
  useEffect(() => { return () => { if (autoAdvTimer.current) clearTimeout(autoAdvTimer.current) } }, [])

  const question = useMemo(() => {
    if (questions.length === 0) return null
    const idx = mode === 'sequential' ? currentIndex : shuffledIndices[currentIndex]
    return questions[idx] || null
  }, [questions, currentIndex, mode, shuffledIndices])

  useEffect(() => {
    if (question) {
      const existing = historyAnswers.get(question.id)
      setSelectedAnswer(existing || null)
      setPendingAnswer(null)
      setAutoAdvancing(false)
    }
  }, [currentIndex, mode, shuffledIndices, question?.id])

  const questionStatus = useMemo(() => {
    const map = new Map<string, boolean | null>()
    for (const [qid, ans] of historyAnswers) {
      const q = questions.find(qq => qq.id === qid)
      map.set(qid, q ? ans === q.answer : null)
    }
    return map
  }, [historyAnswers, questions])

  function fullRestart() {
    localStorage.removeItem(sessionKey)
    setCurrentIndex(0)
    setSelectedAnswer(null)
    setPendingAnswer(null)
    setRecords([])
    setHistoryAnswers(new Map())
    setShowComplete(false)
    setAllDone(false)
    setAutoAdvancing(false)
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
    if (!confirm('确定清除该题库的所有答题记录？\n所有做题记录和错题本都将清空。')) return
    localStorage.removeItem(sessionKey)
    await db.answerRecords.where('bankId').equals(bankId).delete()
    fullRestart()
  }

  const submitAnswer = useCallback(async (answer: string) => {
    if (!question || historyAnswers.has(question.id)) return
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

    // Quick mode: auto-advance on correct
    if (playMode === 'quick' && isCorrect) {
      setAutoAdvancing(true)
      autoAdvTimer.current = setTimeout(() => { nextQuestion() }, 700)
    }
  }, [question, historyAnswers, playMode])

  const handleSelect = useCallback(async (answer: string) => {
    if (!question || historyAnswers.has(question.id)) return

    if (playMode === 'quick') {
      // Quick: instant submit + auto-advance
      await submitAnswer(answer)
    } else if (playMode === 'normal') {
      // Normal: confirm then submit
      if (pendingAnswer === answer) {
        await submitAnswer(answer)
      } else {
        setPendingAnswer(answer)
      }
    }
    // memorize: no clicking
  }, [question, historyAnswers, playMode, pendingAnswer, submitAnswer])

  function jumpToQuestion(qIndex: number) {
    setCurrentIndex(qIndex)
    setShowQuestionList(false)
  }

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
  }, [currentIndex, questions.length, allDone])

  function prevQuestion() {
    if (autoAdvTimer.current) { clearTimeout(autoAdvTimer.current); autoAdvTimer.current = null }
    setAutoAdvancing(false)
    if (currentIndex > 0) setCurrentIndex((i) => i - 1)
  }

  function nextQuestion() {
    if (autoAdvTimer.current) { clearTimeout(autoAdvTimer.current); autoAdvTimer.current = null }
    setAutoAdvancing(false)
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

  const answered = question ? historyAnswers.has(question.id) : false

  return (
    <div>
      <div className="navbar">
        <a className="back" onClick={() => navigate('/')} style={{ cursor: 'pointer' }}>← 返回</a>
        <span className="title">刷题 ({currentIndex + 1}/{questions.length})</span>
        <button className="btn btn-sm btn-outline" onClick={() => setShowQuestionList(true)}>📋</button>
      </div>

      {/* 顺序/随机 */}
      <div className="mode-toggle">
        <button className={mode === 'sequential' ? 'active' : ''}
          onClick={() => { setMode('sequential'); setCurrentIndex(0); setSelectedAnswer(null) }}>
          顺序刷题</button>
        <button className={mode === 'random' ? 'active' : ''}
          onClick={() => { setMode('random'); setCurrentIndex(0); setSelectedAnswer(null) }}>
          随机刷题</button>
      </div>

      {/* 快速/正常/背题 */}
      <div className="mode-toggle" style={{ marginBottom: 12 }}>
        <button className={playMode === 'quick' ? 'active' : ''}
          onClick={() => { setPlayMode('quick'); setPendingAnswer(null) }}>
          ⚡快速</button>
        <button className={playMode === 'normal' ? 'active' : ''}
          onClick={() => { setPlayMode('normal'); setPendingAnswer(null) }}>
          📝正常</button>
        <button className={playMode === 'memorize' ? 'active' : ''}
          onClick={() => { setPlayMode('memorize'); setPendingAnswer(null) }}>
          📖背题</button>
      </div>

      {/* 重置 */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 8, alignItems: 'center' }}>
        <div style={{ flex: 1 }} />
        <button className="btn btn-sm btn-outline" onClick={fullRestart}>🔄 重新开始</button>
        <button className="btn btn-sm btn-outline" style={{ color: '#dc2626', borderColor: '#dc2626' }} onClick={clearAndRestart}>🗑 清除记录</button>
      </div>

      <ProgressBar current={currentIndex + (answered ? 1 : 0)} total={questions.length} />

      <div className="quiz-stats">
        <span>正确 <span style={{ color: '#16a34a' }}>{stats.correct}</span> 错误 <span style={{ color: '#dc2626' }}>{stats.wrong}</span></span>
        <span className="count">{currentIndex + 1} / {questions.length}</span>
      </div>

      {question && (
        <div className="card" onTouchStart={handleTouchStart} onTouchEnd={handleTouchEnd}
          style={{ touchAction: 'pan-y' }}>
          <div className="stem-text">{question.stem}</div>

          <div className="option-list">
            {question.options.map((opt) => {
              let cls = 'option-btn'
              const isCorrectOpt = opt.label === question.answer

              if (playMode === 'memorize') {
                // 背题模式：正确答案高亮，不可点击
                if (isCorrectOpt) cls += ' correct'
              } else if (answered) {
                if (isCorrectOpt) cls += ' correct'
                else if (opt.label === selectedAnswer && !isCorrectOpt) cls += ' wrong'
              } else if (playMode === 'normal' && pendingAnswer === opt.label) {
                cls += ' selected'
              }

              return (
                <button key={opt.label} className={cls}
                  onClick={() => playMode !== 'memorize' ? handleSelect(opt.label) : null}
                  disabled={answered || playMode === 'memorize'}
                >
                  <span className="label">{opt.label}.</span>
                  <span>{opt.text}</span>
                </button>
              )
            })}
          </div>

          {/* 正常模式：再次点击提交 */}
          {playMode === 'normal' && pendingAnswer !== null && !answered && (
            <div style={{ marginTop: 8, fontSize: '0.85rem', color: '#64748b' }}>
              已选 {pendingAnswer}，再次点击或点击下方按钮提交
            </div>
          )}

          {answered && question.explanation && (
            <div className="explanation"><strong>解析：</strong>{question.explanation}</div>
          )}
          {answered && (
            <div style={{ marginTop: 12, fontWeight: 600, color: selectedAnswer === question.answer ? '#16a34a' : '#dc2626' }}>
              {selectedAnswer === question.answer ? '✅ 正确！' : `❌ 错误！正确答案是 ${question.answer}`}
            </div>
          )}
          {autoAdvancing && (
            <div style={{ marginTop: 8, color: '#16a34a', fontSize: '0.85rem' }}>✓ 自动跳转下一题...</div>
          )}

          {/* 背题模式：始终显示答案和解析 */}
          {playMode === 'memorize' && (
            <>
              <div className="explanation" style={{ marginTop: 12 }}>
                <strong>答案：</strong>{question.answer}
              </div>
              {question.explanation && (
                <div className="explanation"><strong>解析：</strong>{question.explanation}</div>
              )}
            </>
          )}
        </div>
      )}

      <div className="quiz-actions">
        <button className="btn btn-outline" disabled={currentIndex === 0} onClick={prevQuestion}>← 上一题</button>
        <button className="btn" style={{ flex: 1 }} disabled={answered ? false : playMode === 'normal' && pendingAnswer === null ? false : false} onClick={nextQuestion}>
          {allDone ? '查看成绩' : currentIndex >= questions.length - 1 ? '完成' : '下一题 →'}
        </button>
      </div>

      {/* 题号网格 */}
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
