import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { getQuestionsByBank, saveAnswerRecord, db } from '../db'
import type { Question, AnswerRecord } from '../types'
import ProgressBar from '../components/ProgressBar'

interface Props { qType: 'explain' | 'short_answer' }

type PlayMode = 'quick' | 'normal' | 'memorize'

const LABEL: Record<string, string> = { explain: '名词解释', short_answer: '简答题' }

export default function TextQuiz({ qType }: Props) {
  const { bankId } = useParams<{ bankId: string }>()
  const navigate = useNavigate()

  const [allQuestions, setAllQuestions] = useState<Question[]>([])
  const [currentIndex, setCurrentIndex] = useState(0)
  const [playMode, setPlayMode] = useState<PlayMode>('normal')
  const [records, setRecords] = useState<AnswerRecord[]>([])
  const [showComplete, setShowComplete] = useState(false)
  const [startTime, setStartTime] = useState(Date.now())
  const [shuffledIndices, setShuffledIndices] = useState<number[]>([])
  const [allDone, setAllDone] = useState(false)
  const [historyAnswers, setHistoryAnswers] = useState<Map<string, string>>(new Map())
  const [selfEvals, setSelfEvals] = useState<Map<string, boolean>>(new Map())
  const [answerRevealed, setAnswerRevealed] = useState(false)
  const [revealedIds, setRevealedIds] = useState<Set<string>>(new Set())
  const [showQuestionList, setShowQuestionList] = useState(false)
  const [autoAdvancing, setAutoAdvancing] = useState(false)
  const touchStartX = useRef(0)
  const touchStartY = useRef(0)
  const autoAdvTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const sessionKey = `quiz_session_${bankId}_${qType}`

  useEffect(() => { return () => { if (autoAdvTimer.current) clearTimeout(autoAdvTimer.current) } }, [])

  useEffect(() => {
    if (!bankId) return
    getQuestionsByBank(bankId).then((qs) => {
      const filtered = qs.filter((q) => (q as any).type === qType)
      setAllQuestions(filtered)

      const saved = localStorage.getItem(sessionKey)
      if (saved) {
        try {
          const s = JSON.parse(saved)
          setCurrentIndex(s.currentIndex || 0)
          setPlayMode(s.playMode || 'normal')
          setShuffledIndices(s.shuffledIndices || [])
          setStartTime(s.startTime || Date.now())
          if (s.historyAnswers) setHistoryAnswers(new Map(Object.entries(s.historyAnswers)))
          if (s.selfEvals) setSelfEvals(new Map(Object.entries(s.selfEvals)))
          if (s.revealedIds) setRevealedIds(new Set(s.revealedIds))
          return
        } catch (e) {}
      }

      const indices = Array.from({ length: filtered.length }, (_, i) => i)
      for (let i = indices.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [indices[i], indices[j]] = [indices[j], indices[i]]
      }
      setShuffledIndices(indices)
    })
  }, [bankId])

  useEffect(() => {
    if (!bankId || allQuestions.length === 0) return
    localStorage.setItem(sessionKey, JSON.stringify({
      currentIndex, playMode, shuffledIndices, startTime,
      historyAnswers: Object.fromEntries(historyAnswers),
      selfEvals: Object.fromEntries(selfEvals),
      revealedIds: [...revealedIds],
    }))
  }, [currentIndex, playMode, historyAnswers, selfEvals, shuffledIndices, startTime, bankId, allQuestions.length])

  const question = useMemo(() => {
    if (allQuestions.length === 0) return null
    const idx = shuffledIndices[currentIndex]
    return allQuestions[idx] || null
  }, [allQuestions, currentIndex, shuffledIndices])

  useEffect(() => {
    if (question) {
      if (playMode === 'memorize') {
        setAnswerRevealed(true)
        setRevealedIds((prev) => new Set(prev).add(question.id))
      } else {
        setAnswerRevealed(revealedIds.has(question.id))
      }
    }
  }, [currentIndex, shuffledIndices, question?.id, playMode])

  function fullRestart() {
    localStorage.removeItem(sessionKey)
    setCurrentIndex(0)
    setRecords([])
    setHistoryAnswers(new Map())
    setSelfEvals(new Map())
    setRevealedIds(new Set())
    setAnswerRevealed(false)
    setShowComplete(false)
    setAllDone(false)
    setAutoAdvancing(false)
    setStartTime(Date.now())
    const indices = Array.from({ length: allQuestions.length }, (_, i) => i)
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

  const revealAnswer = useCallback(async () => {
    if (!question || revealedIds.has(question.id)) return
    setAnswerRevealed(true)
    setRevealedIds((prev) => new Set(prev).add(question.id))
  }, [question, revealedIds])

  const handleSelfEval = useCallback(async (isCorrect: boolean) => {
    if (!question) return
    setSelfEvals((prev) => new Map(prev).set(question.id, isCorrect))
    const record: AnswerRecord = {
      questionId: question.id, bankId: question.bankId,
      userAnswer: isCorrect ? '自评: 正确' : '自评: 错误',
      isCorrect, timestamp: Date.now(),
    }
    setRecords((prev) => [...prev, record])
    await saveAnswerRecord(record)

    // Quick mode: auto-advance if self-evaluated as correct
    if (playMode === 'quick' && isCorrect) {
      setAutoAdvancing(true)
      autoAdvTimer.current = setTimeout(() => { nextQuestion() }, 700)
    }
  }, [question, playMode])

  function prevQuestion() {
    if (autoAdvTimer.current) { clearTimeout(autoAdvTimer.current); autoAdvTimer.current = null }
    setAutoAdvancing(false)
    if (currentIndex > 0) setCurrentIndex((i) => i - 1)
  }

  function nextQuestion() {
    if (autoAdvTimer.current) { clearTimeout(autoAdvTimer.current); autoAdvTimer.current = null }
    setAutoAdvancing(false)
    if (currentIndex >= allQuestions.length - 1) {
      setAllDone(true)
      setShowComplete(true)
      return
    }
    setCurrentIndex((i) => i + 1)
  }

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
  }, [currentIndex, allQuestions.length, allDone])

  const stats = useMemo(() => {
    const total = records.length
    const correct = records.filter((r) => r.isCorrect).length
    return { total, correct, wrong: total - correct }
  }, [records])

  const questionStatus = useMemo(() => {
    const map = new Map<string, boolean | null>()
    for (const q of allQuestions) {
      if (selfEvals.has(q.id)) map.set(q.id, selfEvals.get(q.id)!)
      else map.set(q.id, null)
    }
    return map
  }, [allQuestions, selfEvals])

  // ---- 完成页 ----
  if (showComplete) {
    const elapsed = Math.floor((Date.now() - startTime) / 1000)
    const minutes = Math.floor(elapsed / 60)
    const seconds = elapsed % 60
    const pct = stats.total > 0 ? Math.round((stats.correct / stats.total) * 100) : 0

    return (
      <div>
        <div className="navbar"><span className="title">{LABEL[qType]}完成</span></div>
        <div className="card text-center" style={{ padding: '32px 16px' }}>
          <h2 style={{ marginBottom: 12 }}>全部完成！</h2>
          <div className={`big-score ${pct >= 60 ? 'good' : 'bad'}`}>{pct}%</div>
          <div className="detail">
            正确 {stats.correct} / 共 {stats.total} 题<br />
            用时 {minutes} 分 {seconds} 秒<br />
            错误 {stats.wrong} 道
          </div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap' }}>
            <button className="btn" onClick={fullRestart}>重新开始</button>
            <button className="btn btn-outline" onClick={() => navigate(`/wrong/${bankId}`)}>查看错题</button>
            <button className="btn btn-outline" onClick={() => navigate('/')}>返回首页</button>
          </div>
        </div>
      </div>
    )
  }

  const isSelfEvalDone = question ? selfEvals.has(question.id) : false

  return (
    <div>
      <div className="navbar">
        <a className="back" onClick={() => navigate('/')} style={{ cursor: 'pointer' }}>← 返回</a>
        <span className="title">{LABEL[qType]} ({currentIndex + 1}/{allQuestions.length})</span>
        <button className="btn btn-sm btn-outline" onClick={() => setShowQuestionList(true)}>📋</button>
      </div>

      {/* 快速/正常/背题 */}
      <div className="mode-toggle" style={{ marginBottom: 12 }}>
        <button className={playMode === 'quick' ? 'active' : ''}
          onClick={() => { setPlayMode('quick') }}>
          ⚡快速</button>
        <button className={playMode === 'normal' ? 'active' : ''}
          onClick={() => { setPlayMode('normal') }}>
          📝正常</button>
        <button className={playMode === 'memorize' ? 'active' : ''}
          onClick={() => { setPlayMode('memorize') }}>
          📖背题</button>
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 8, alignItems: 'center' }}>
        <div style={{ flex: 1 }} />
        <button className="btn btn-sm btn-outline" onClick={fullRestart}>重新开始</button>
        <button className="btn btn-sm btn-outline" style={{ color: '#dc2626', borderColor: '#dc2626' }} onClick={clearAndRestart}>清除记录</button>
      </div>

      <ProgressBar current={currentIndex + (isSelfEvalDone ? 1 : 0)} total={allQuestions.length} />

      <div className="quiz-stats">
        <span>正确 <span style={{ color: '#16a34a' }}>{stats.correct}</span> 错误 <span style={{ color: '#dc2626' }}>{stats.wrong}</span></span>
        <span className="count">{currentIndex + 1} / {allQuestions.length}</span>
      </div>

      {question && (
        <div className="card" onTouchStart={handleTouchStart} onTouchEnd={handleTouchEnd} style={{ touchAction: 'pan-y' }}>
          <div className="stem-text">{question.stem}</div>

          {answerRevealed ? (
            <>
              <div className="explanation" style={{ marginTop: 12 }}>
                <strong>参考答案：</strong>
                <p style={{ marginTop: 4 }}>{question.answer}</p>
              </div>
              {question.explanation && (
                <div className="explanation" style={{ marginTop: 8 }}>
                  <strong>解析：</strong>{question.explanation}
                </div>
              )}
              {!isSelfEvalDone && playMode !== 'memorize' ? (
                <div className="self-eval-buttons" style={{ marginTop: 12, display: 'flex', gap: 12 }}>
                  <button className="btn self-eval-btn correct" onClick={() => handleSelfEval(true)}>我答对了</button>
                  <button className="btn self-eval-btn wrong" onClick={() => handleSelfEval(false)}>我答错了</button>
                </div>
              ) : (
                <div style={{ marginTop: 12, fontWeight: 600, color: selfEvals.get(question.id) ? '#16a34a' : '#dc2626' }}>
                  {isSelfEvalDone ? (selfEvals.get(question.id) ? '自评正确' : '自评错误') : '📖 背题模式'}
                </div>
              )}
              {autoAdvancing && (
                <div style={{ marginTop: 8, color: '#16a34a', fontSize: '0.85rem' }}>✓ 自动跳转下一题...</div>
              )}
            </>
          ) : (
            <button className="btn btn-block mt-16" onClick={revealAnswer}>查看答案</button>
          )}
        </div>
      )}

      <div className="quiz-actions">
        <button className="btn btn-outline" disabled={currentIndex === 0} onClick={prevQuestion}>← 上一题</button>
        <button className="btn" style={{ flex: 1 }} disabled={playMode !== 'memorize' && answerRevealed && !isSelfEvalDone}
          onClick={nextQuestion}>
          {allDone ? '查看成绩' : currentIndex >= allQuestions.length - 1 ? '完成' : '下一题 →'}
        </button>
      </div>

      {showQuestionList && (
        <div className="modal-overlay" onClick={() => setShowQuestionList(false)}>
          <div className="modal" style={{ maxWidth: 480 }} onClick={(e) => e.stopPropagation()}>
            <h3>选择题目</h3>
            <div className="question-grid">
              {allQuestions.map((q, i) => {
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
