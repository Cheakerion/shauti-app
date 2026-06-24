import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { getQuestionsByBank, markQuestion, unmarkQuestion, getMarkedQuestionIds, clearMarkedQuestions } from '../db'
import type { Question } from '../types'
import ProgressBar from '../components/ProgressBar'

interface Props { qType: 'explain' | 'short_answer' }

type PlayMode = 'normal' | 'memorize'
type FilterMode = 'all' | 'marked' | 'unmarked'

const LABEL: Record<string, string> = { explain: '名词解释', short_answer: '简答题' }

export default function TextQuiz({ qType }: Props) {
  const { bankId } = useParams<{ bankId: string }>()
  const navigate = useNavigate()

  const [allQuestions, setAllQuestions] = useState<Question[]>([])
  const [currentIndex, setCurrentIndex] = useState(0)
  const [playMode, setPlayMode] = useState<PlayMode>('normal')
  const [filterMode, setFilterMode] = useState<FilterMode>('all')
  const [showComplete, setShowComplete] = useState(false)
  const [startTime, setStartTime] = useState(Date.now())
  const [shuffledIndices, setShuffledIndices] = useState<number[]>([])
  const [allDone, setAllDone] = useState(false)
  const [answerRevealed, setAnswerRevealed] = useState(false)
  const [revealedIds, setRevealedIds] = useState<Set<string>>(new Set())
  const [markedIds, setMarkedIds] = useState<Set<string>>(new Set())
  const [showQuestionList, setShowQuestionList] = useState(false)
  const touchStartX = useRef(0)
  const touchStartY = useRef(0)

  const sessionKey = `quiz_session_${bankId}_${qType}`

  // ---- 加载题目 + 标记 ----
  useEffect(() => {
    if (!bankId) return
    getQuestionsByBank(bankId).then((qs) => {
      const filtered = qs.filter((q) => (q as any).type === qType)
      setAllQuestions(filtered)

      // 加载已标记的题目 ID
      getMarkedQuestionIds(bankId).then(ids => setMarkedIds(new Set(ids)))

      const saved = localStorage.getItem(sessionKey)
      if (saved) {
        try {
          const s = JSON.parse(saved)
          setCurrentIndex(s.currentIndex || 0)
          setPlayMode(s.playMode || 'normal')
          setFilterMode(s.filterMode || 'all')
          setShuffledIndices(s.shuffledIndices || [])
          setStartTime(s.startTime || Date.now())
          if (s.revealedIds) setRevealedIds(new Set(s.revealedIds))
          return
        } catch (e) {}
      }

      // 新 session：洗牌
      const indices = Array.from({ length: filtered.length }, (_, i) => i)
      for (let i = indices.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [indices[i], indices[j]] = [indices[j], indices[i]]
      }
      setShuffledIndices(indices)
    })
  }, [bankId])

  // ---- 持久化 session to localStorage ----
  useEffect(() => {
    if (!bankId || allQuestions.length === 0) return
    localStorage.setItem(sessionKey, JSON.stringify({
      currentIndex, playMode, filterMode, shuffledIndices, startTime,
      revealedIds: [...revealedIds],
    }))
  }, [currentIndex, playMode, filterMode, shuffledIndices, startTime, bankId, allQuestions.length, revealedIds])

  // ---- 筛选后的题目列表 ----
  const filteredQuestions = useMemo(() => {
    switch (filterMode) {
      case 'marked':
        return allQuestions.filter(q => markedIds.has(q.id))
      case 'unmarked':
        return allQuestions.filter(q => !markedIds.has(q.id))
      default:
        return allQuestions
    }
  }, [allQuestions, filterMode, markedIds])

  // ---- 当前题目 ----
  const question = useMemo(() => {
    if (filteredQuestions.length === 0) return null
    const idx = shuffledIndices[currentIndex]
    return filteredQuestions[idx] || null
  }, [filteredQuestions, currentIndex, shuffledIndices])

  // ---- 筛选切换时重新洗牌 ----
  useEffect(() => {
    const indices = Array.from({ length: filteredQuestions.length }, (_, i) => i)
    for (let i = indices.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [indices[i], indices[j]] = [indices[j], indices[i]]
    }
    setShuffledIndices(indices)
    setCurrentIndex(0)
  }, [filterMode])

  // ---- 同步 answerRevealed 状态 ----
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

  // ---- 重置 session（不动 IndexedDB） ----
  function fullRestart() {
    localStorage.removeItem(sessionKey)
    setCurrentIndex(0)
    setAnswerRevealed(false)
    setRevealedIds(new Set())
    setShowComplete(false)
    setAllDone(false)
    setStartTime(Date.now())
    const len = filteredQuestions.length
    const indices = Array.from({ length: len }, (_, i) => i)
    for (let i = indices.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [indices[i], indices[j]] = [indices[j], indices[i]]
    }
    setShuffledIndices(indices)
  }

  // ---- 清除标记 + 重置 session ----
  async function clearMarksAndRestart() {
    if (!bankId) return
    if (!confirm('确定清除该题库的所有标记？\n标记数据将被删除，刷题进度将重置。')) return
    await clearMarkedQuestions(bankId)
    setMarkedIds(new Set())
    fullRestart()
  }

  // ---- 展开 / 收起答案 ----
  const toggleAnswer = useCallback(() => {
    if (!question) return
    if (answerRevealed) {
      setAnswerRevealed(false)
    } else {
      setAnswerRevealed(true)
      setRevealedIds((prev) => new Set(prev).add(question.id))
    }
  }, [question, answerRevealed])

  // ---- 标记 / 取消标记 ----
  async function toggleMark(questionId: string) {
    if (!bankId) return
    if (markedIds.has(questionId)) {
      await unmarkQuestion(questionId)
      setMarkedIds(prev => {
        const next = new Set(prev)
        next.delete(questionId)
        return next
      })
    } else {
      await markQuestion(questionId, bankId)
      setMarkedIds(prev => new Set(prev).add(questionId))
    }
  }

  // ---- 导航 ----
  function prevQuestion() {
    if (currentIndex > 0) setCurrentIndex((i) => i - 1)
  }

  function nextQuestion() {
    if (currentIndex >= filteredQuestions.length - 1) {
      setAllDone(true)
      setShowComplete(true)
      return
    }
    setCurrentIndex((i) => i + 1)
  }

  function jumpToQuestion(qIndex: number) {
    if (qIndex === -1) {
      setFilterMode('all')
    } else {
      setCurrentIndex(qIndex)
    }
    setShowQuestionList(false)
  }

  // ---- 触摸滑动 ----
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
  }, [currentIndex, filteredQuestions.length, allDone])

  // ---- 题号网格状态 ----
  const questionStatus = useMemo(() => {
    const map = new Map<string, { revealed: boolean; marked: boolean }>()
    for (const q of allQuestions) {
      map.set(q.id, {
        revealed: revealedIds.has(q.id),
        marked: markedIds.has(q.id),
      })
    }
    return map
  }, [allQuestions, revealedIds, markedIds])

  // ---- 完成页 ----
  if (showComplete) {
    const elapsed = Math.floor((Date.now() - startTime) / 1000)
    const minutes = Math.floor(elapsed / 60)
    const seconds = elapsed % 60

    return (
      <div>
        <div className="navbar"><span className="title">{LABEL[qType]}完成</span></div>
        <div className="card text-center" style={{ padding: '32px 16px' }}>
          <h2 style={{ marginBottom: 12 }}>全部完成！</h2>
          <div className="detail">
            共浏览 {revealedIds.size} / {filteredQuestions.length} 题<br />
            标记 {markedIds.size} 题<br />
            用时 {minutes} 分 {seconds} 秒
          </div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap' }}>
            <button className="btn" onClick={clearMarksAndRestart}>消除标记</button>
            <button className="btn btn-outline" onClick={() => navigate('/')}>返回首页</button>
          </div>
        </div>
      </div>
    )
  }

  // ---- 主界面 ----
  return (
    <div>
      {/* 导航栏 */}
      <div className="navbar">
        <a className="back" onClick={() => navigate('/')} style={{ cursor: 'pointer' }}>← 返回</a>
        <span className="title">{LABEL[qType]} ({currentIndex + 1}/{filteredQuestions.length})</span>
        <button className="btn btn-sm btn-outline" onClick={() => setShowQuestionList(true)}>📋</button>
      </div>

      {/* 正常 / 背题 */}
      <div className="mode-toggle" style={{ marginBottom: 12 }}>
        <button className={playMode === 'normal' ? 'active' : ''}
          onClick={() => { setPlayMode('normal') }}>
          正常</button>
        <button className={playMode === 'memorize' ? 'active' : ''}
          onClick={() => { setPlayMode('memorize') }}>
          背题</button>
      </div>

      {/* 标记筛选 */}
      <div className="mode-toggle" style={{ marginBottom: 12 }}>
        <button className={filterMode === 'all' ? 'active' : ''}
          onClick={() => { setFilterMode('all') }}>
          全部</button>
        <button className={filterMode === 'marked' ? 'active' : ''}
          onClick={() => { setFilterMode('marked') }}>
          已标记 ({allQuestions.filter(q => markedIds.has(q.id)).length})</button>
        <button className={filterMode === 'unmarked' ? 'active' : ''}
          onClick={() => { setFilterMode('unmarked') }}>
          未标记</button>
      </div>

      {/* 消除标记 */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 8, alignItems: 'center' }}>
        <div style={{ flex: 1 }} />
        <button className="btn btn-sm btn-outline" style={{ color: '#dc2626', borderColor: '#dc2626' }}
          onClick={clearMarksAndRestart}>消除标记</button>
      </div>

      {/* 进度条 */}
      <ProgressBar current={currentIndex + (answerRevealed ? 1 : 0)} total={filteredQuestions.length} />

      {/* 统计行 */}
      <div className="quiz-stats">
        <span>已看 <span style={{ color: '#16a34a' }}>{revealedIds.size}</span> 标记 <span style={{ color: '#e67e22' }}>{markedIds.size}</span></span>
        <span className="count">{currentIndex + 1} / {filteredQuestions.length}</span>
      </div>

      {/* 空状态 */}
      {filteredQuestions.length === 0 && filterMode !== 'all' && (
        <div className="empty-state" style={{ marginTop: 24 }}>
          <div className="icon">{filterMode === 'marked' ? '🔖' : '📝'}</div>
          <h3>{filterMode === 'marked' ? '没有标记的题目' : '所有题目都已标记'}</h3>
          <p>{filterMode === 'marked' ? '点击题目上的标记按钮来添加标记' : ''}</p>
        </div>
      )}

      {/* 题目卡片 */}
      {question && (
        <div className="card" onTouchStart={handleTouchStart} onTouchEnd={handleTouchEnd} style={{ touchAction: 'pan-y' }}>
          {/* 题干：名词解释只显示英文术语 */}
          <div className="stem-text">
            {qType === 'explain' && question.engStem ? question.engStem : question.stem}
          </div>

          {answerRevealed ? (
            <>
              {/* 名词解释：中文术语和定义一起放在答案区 */}
              {qType === 'explain' && question.engStem && (
                <div className="explanation" style={{ marginTop: 12 }}>
                  <strong>{question.stem}</strong>
                </div>
              )}
              <div className="explanation" style={{ marginTop: 12 }}>
                <strong>参考答案：</strong>
                <p style={{ marginTop: 4 }}>{question.answer}</p>
              </div>
              {question.explanation && (
                <div className="explanation" style={{ marginTop: 8 }}>
                  <strong>解析：</strong>{question.explanation}
                </div>
              )}

              {/* 标记 + 收起按钮 */}
              <div style={{ marginTop: 12, display: 'flex', gap: 12 }}>
                <button
                  className={`btn btn-sm ${markedIds.has(question.id) ? 'btn-mark marked' : 'btn-mark'}`}
                  onClick={() => toggleMark(question.id)}
                >
                  {markedIds.has(question.id) ? '已标记' : '标记此题'}
                </button>
                {playMode !== 'memorize' && (
                  <button className="btn btn-sm btn-outline" onClick={toggleAnswer}>
                    收起答案
                  </button>
                )}
              </div>
            </>
          ) : (
            <button className="btn btn-block mt-16" onClick={toggleAnswer}>查看答案</button>
          )}
        </div>
      )}

      {/* 底部导航 */}
      <div className="quiz-actions">
        <button className="btn btn-outline" disabled={currentIndex === 0} onClick={prevQuestion}>← 上一题</button>
        <button className="btn" style={{ flex: 1 }}
          onClick={nextQuestion}>
          {allDone ? '查看成绩' : currentIndex >= filteredQuestions.length - 1 ? '完成' : '下一题 →'}
        </button>
      </div>

      {/* 题号网格弹窗 */}
      {showQuestionList && (
        <div className="modal-overlay" onClick={() => setShowQuestionList(false)}>
          <div className="modal" style={{ maxWidth: 480 }} onClick={(e) => e.stopPropagation()}>
            <h3>选择题目</h3>
            <div className="question-grid">
              {allQuestions.map((q, i) => {
                const status = questionStatus.get(q.id)
                let dotCls = 'q-dot'
                if (status?.revealed) dotCls += ' q-correct'
                if (status?.marked) dotCls += ' q-marked'
                const filteredIdx = filteredQuestions.findIndex(fq => fq.id === q.id)
                if (filteredIdx === currentIndex && filteredIdx !== -1) dotCls += ' q-current'
                return (
                  <button key={q.id} className={dotCls} onClick={() => jumpToQuestion(filteredIdx)}>
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
