import { useState, useEffect, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { getAllBanks, deleteBank, saveBank } from '../db'
import { parseMarkdownBank, generateId } from '../parser'
import type { QuestionBank, Question } from '../types'

export default function Home() {
  const [banks, setBanks] = useState<QuestionBank[]>([])
  const [dragover, setDragover] = useState(false)
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const refresh = useCallback(async () => {
    setBanks(await getAllBanks())
  }, [])

  useEffect(() => { refresh() }, [refresh])

  // Receive file from Android WebView (WeChat share, file open, etc.)
  useEffect(() => {
    const handler = () => {
      const Android = (window as any).Android
      if (!Android) return
      const text = Android.getFileText()
      const name = Android.getFileName() || 'import.md'
      if (!text) return
      const blob = new Blob([text], { type: 'text/markdown' })
      const file = new File([blob], name, { type: 'text/markdown' })
      handleFile(file)
    }
    document.addEventListener('hermes-file-ready', handler)
    return () => document.removeEventListener('hermes-file-ready', handler)
  }, [])

  async function handleFile(file: File) {
    if (!file.name.endsWith('.md') && !file.name.endsWith('.txt')) {
      alert('只支持 .md 格式的题库文件')
      return
    }
    setLoading(true)
    try {
      const text = await file.text()
      const result = parseMarkdownBank(text)
      if (result.questions.length === 0) {
        alert('未解析到任何题目，请检查文件格式')
        return
      }
      const bankId = generateId()
      const bank: QuestionBank = {
        id: bankId, title: result.title, fileName: file.name,
        totalCount: result.questions.length, createdAt: Date.now(),
      }
      const questions: Question[] = result.questions.map((q, i) => ({
        ...q, id: generateId(), bankId, index: i + 1,
      }))
      await saveBank(bank, questions)
      await refresh()
      alert(`导入成功！「${result.title}」共 ${result.questions.length} 题`)
    } catch (err) {
      alert('导入失败：' + (err instanceof Error ? err.message : '未知错误'))
    } finally { setLoading(false) }
  }

  async function checkUpdate() {
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), 15000)
    let latestVer = '', lastErr = '', code = 0

    const urls = [
      'https://raw.githubusercontent.com/Cheakerion/shauti-app/master/version.json',
      'https://cdn.jsdelivr.net/gh/Cheakerion/shauti-app@master/version.json',
    ]
    for (const url of urls) {
      try {
        const res = await fetch(url, { signal: ctrl.signal, cache: 'no-cache' })
        code = res.status
        if (res.ok) { latestVer = (await res.json()).version || ''; break }
        lastErr = 'HTTP ' + res.status
      } catch (e: any) { lastErr = (e.message || String(e)).slice(0, 60); code = 0 }
    }
    const cur = localStorage.getItem('quiz_app_ver') || ''
    clearTimeout(timer)

    if (latestVer && latestVer !== cur) {
      if (confirm(`发现 v${latestVer} (当前${cur||'?'})\n下载？`)) {
        localStorage.setItem('quiz_app_ver', latestVer)
        window.open('https://cdn.jsdelivr.net/gh/Cheakerion/shauti-app@master/releases/quiz.apk', '_blank')
      }
      return
    }
    if (latestVer) { alert(`已是最新 (v${latestVer})`); return }
    alert(`更新失败 code=${code} err=${lastErr}`)
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault(); setDragover(false)
    const file = e.dataTransfer.files[0]
    if (file) handleFile(file)
  }

  async function handleDelete(bankId: string, title: string) {
    if (!confirm(`确定删除题库「${title}」？`)) return
    await deleteBank(bankId); await refresh()
  }

  return (
    <div>
      <div className="home-header">
        <h1>📝 刷题</h1>
        <p>导入题库，开始刷题</p>
        <button className="btn btn-sm btn-outline mt-8" onClick={checkUpdate}>🔄 检查更新</button>
      </div>

      <label
        className={`drop-zone ${dragover ? 'dragover' : ''}`}
        onDragOver={(e) => { e.preventDefault(); setDragover(true) }}
        onDragLeave={() => setDragover(false)} onDrop={handleDrop}
      >
        <div style={{ fontSize: '2rem', marginBottom: 8 }}>📂</div>
        <div>{loading ? '导入中...' : '点击选择 .md 题库文件'}</div>
        <input ref={fileInputRef} type="file" accept=".md,.txt,.text/*" disabled={loading}
          onChange={(e) => {
            if ((window as any).__hermesFilePending) { delete (window as any).__hermesFilePending; e.target.value = ''; return }
            const file = e.target.files?.[0]; if (file) handleFile(file); e.target.value = ''
          }} />
      </label>

      {banks.length === 0 ? (
        <div className="empty-state">
          <div className="icon">📭</div><h3>还没有题库</h3><p>点击上方导入 .md 题库文件</p>
        </div>
      ) : banks.map(bank => (
        <div className="card bank-card" key={bank.id}>
          <div className="bank-title">{bank.title}</div>
          <div className="bank-meta">{bank.fileName} · {bank.totalCount} 题</div>
          <div className="bank-actions">
            <button className="btn" onClick={() => navigate(`/quiz/${bank.id}`)}>开始刷题</button>
            <button className="btn btn-outline btn-sm" onClick={() => navigate(`/wrong/${bank.id}`)}>错题本</button>
            <button className="btn btn-outline btn-sm" style={{ color: '#dc2626', borderColor: '#dc2626' }}
              onClick={() => handleDelete(bank.id, bank.title)}>删除</button>
          </div>
        </div>
      ))}
    </div>
  )
}
