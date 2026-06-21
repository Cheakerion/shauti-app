import { useState, useEffect, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { getAllBanks, deleteBank, saveBank, getBankTypes } from '../db'
import { parseMarkdownBank, generateId } from '../parser'
import type { QuestionBank, Question } from '../types'

export default function Home() {
  const [banks, setBanks] = useState<QuestionBank[]>([])
  const [bankTypes, setBankTypes] = useState<Record<string, string[]>>({})
  const [dragover, setDragover] = useState(false)
  const [loading, setLoading] = useState(false)
  const [updateVer, setUpdateVer] = useState<string | null>(null)
  const [downloading, setDownloading] = useState(false)
  const navigate = useNavigate()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const refresh = useCallback(async () => {
    const list = await getAllBanks()
    setBanks(list)
    // Load types for all banks
    const types: Record<string, string[]> = {}
    for (const b of list) {
      types[b.id] = await getBankTypes(b.id)
    }
    setBankTypes(types)
  }, [])

  useEffect(() => { refresh() }, [refresh])

  // 启动时自动检测更新
  useEffect(() => {
    autoCheckUpdate()
  }, [])

  async function autoCheckUpdate() {
    try {
      const ctrl = new AbortController()
      const timer = setTimeout(() => ctrl.abort(), 8000)
      const url = `https://raw.githubusercontent.com/Cheakerion/shauti-app/master/version.json?t=${Date.now()}`
      const res = await fetch(url, { signal: ctrl.signal, cache: 'no-store' })
      clearTimeout(timer)
      const latestVer = (await res.json()).version
      let cur = localStorage.getItem('quiz_app_ver') || ''
      if (!cur && latestVer) { localStorage.setItem('quiz_app_ver', latestVer); cur = latestVer }
      if (latestVer && newer(latestVer, cur || '0')) {
        setUpdateVer(latestVer)
      }
    } catch (e) { /* 静默失败，用户可手动检查 */ }
  }

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

  function newer(a: string, b: string) {
    const pa = a.split('.').map(Number), pb = b.split('.').map(Number)
    for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
      if ((pa[i]||0) !== (pb[i]||0)) return (pa[i]||0) > (pb[i]||0)
    }
    return false
  }

  async function checkUpdate() {
    const Android = (window as any).Android
    let cur = localStorage.getItem('quiz_app_ver') || ''

    // 并行获取：Android 桥 + 浏览器 fetch，取最新的
    const candidates: (string | null)[] = [null, null]

    const doFetch = async () => {
      try {
        const ctrl = new AbortController()
        const timer = setTimeout(() => ctrl.abort(), 10000)
        const url = `https://raw.githubusercontent.com/Cheakerion/shauti-app/master/version.json?t=${Date.now()}`
        const res = await fetch(url, { signal: ctrl.signal, cache: 'no-store' })
        clearTimeout(timer)
        return (await res.json()).version
      } catch (e: any) {
        console.warn('fetch版本失败:', e.message)
        return null
      }
    }

    const getAndroidVer = (): string | null => {
      try {
        if (Android?.checkVersion) {
          const v = Android.checkVersion()
          if (v && !v.startsWith('ERR:')) return v
        }
      } catch (e) {}
      return null
    }

    // 并行请求
    const [androidVer, fetchVer] = await Promise.all([
      Promise.resolve(getAndroidVer()),
      doFetch(),
    ])
    candidates[0] = androidVer
    candidates[1] = fetchVer

    // 取最新的版本
    let latestVer = ''
    for (const v of candidates) {
      if (v && newer(v, latestVer || '0')) latestVer = v
    }

    if (!latestVer) { alert('更新失败: 无法获取版本信息'); return }
    if (!cur && latestVer) { localStorage.setItem('quiz_app_ver', latestVer); cur = latestVer }

    if (newer(latestVer, cur || '0')) {
      if (confirm(`发现 v${latestVer} (当前${cur||'?'})\n下载？`)) {
        handleDownload(latestVer)
      }
    } else {
      alert(`已是最新 (v${latestVer})`)
    }
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault(); setDragover(false)
    const file = e.dataTransfer.files[0]
    if (file) handleFile(file)
  }

  function handleDownload(ver: string) {
    setDownloading(true)
    localStorage.setItem('quiz_app_ver', ver)
    window.open('https://raw.githubusercontent.com/Cheakerion/shauti-app/master/releases/%E5%88%B7%E9%A2%98.apk', '_blank')
    // APK 只有 ~130KB，3 秒足够下完
    setTimeout(() => {
      setDownloading(false)
      setUpdateVer(null)
      alert('下载完成，请安装新版本')
    }, 3000)
  }

  const [deleteTarget, setDeleteTarget] = useState<{ id: string; title: string } | null>(null)

  async function doDelete() {
    if (!deleteTarget) return
    await deleteBank(deleteTarget.id); await refresh()
    setDeleteTarget(null)
  }

  /** 根据题型返回开始刷题的路由 */
  function getQuizRoute(bankId: string): string {
    const types = bankTypes[bankId] || ['choice']
    if (types.includes('explain')) return `/explain/${bankId}`
    if (types.includes('short_answer')) return `/short-answer/${bankId}`
    return `/quiz/${bankId}`
  }

  /** 题型对应的标签 */
  function getTypeLabel(bankId: string): string {
    const types = bankTypes[bankId] || ['choice']
    const labels: Record<string, string> = { choice: '选择题', explain: '名词解释', short_answer: '简答题' }
    return types.map(t => labels[t] || t).join('+')
  }

  return (
    <div>
      {updateVer && (
        <div className="update-banner">
          <span>发现新版本 v{updateVer}！</span>
          {downloading ? (
            <span className="download-status">⏳ 下载中...</span>
          ) : (
            <button className="btn btn-sm" onClick={() => handleDownload(updateVer)}>下载更新</button>
          )}
          <button className="btn btn-sm btn-outline" onClick={() => setUpdateVer(null)}>✕</button>
        </div>
      )}
      <div className="home-header">
        <h1>📝 刷题</h1>
        <p>导入题库，开始刷题</p>
        <button className="btn btn-sm btn-outline mt-8" onClick={checkUpdate}>🔄 检查更新</button>
      </div>

      <div
        className={`drop-zone ${dragover ? 'dragover' : ''}`}
        onDragOver={(e) => { e.preventDefault(); setDragover(true) }}
        onDragLeave={() => setDragover(false)} onDrop={handleDrop}
        style={{ position: 'relative', overflow: 'hidden' }}
      >
        <div style={{ fontSize: '2rem', marginBottom: 8 }}>📂</div>
        <div>{loading ? '导入中...' : '点击选择 .md 题库文件'}</div>
        <input ref={fileInputRef} type="file" accept=".md,.txt,.text/*" disabled={loading}
          style={{ position: 'absolute', inset: 0, opacity: 0, cursor: 'pointer' }}
          onChange={(e) => {
            if ((window as any).__hermesFilePending) { delete (window as any).__hermesFilePending; e.target.value = ''; return }
            const file = e.target.files?.[0]; if (file) handleFile(file); e.target.value = ''
          }} />
      </div>

      {banks.length === 0 ? (
        <div className="empty-state">
          <div className="icon">📭</div><h3>还没有题库</h3><p>点击上方导入 .md 题库文件</p>
        </div>
      ) : banks.map(bank => (
        <div className="card bank-card" key={bank.id}>
          <div className="bank-title">{bank.title}</div>
          <div className="bank-meta">{bank.fileName} · {bank.totalCount} 题</div>
          <div className="bank-meta" style={{ marginTop: 4 }}>题型: {getTypeLabel(bank.id)}</div>
          <div className="bank-actions">
            <button className="btn" onClick={() => navigate(getQuizRoute(bank.id))}>开始刷题</button>
            <button className="btn btn-outline btn-sm" onClick={() => navigate(`/wrong/${bank.id}`)}>错题本</button>
            <button className="btn btn-outline btn-sm" style={{ color: '#dc2626', borderColor: '#dc2626' }}
              onClick={() => setDeleteTarget({ id: bank.id, title: bank.title })}>删除</button>
          </div>
        </div>
      ))}

      {/* 删除确认弹窗 */}
      {deleteTarget && (
        <div className="modal-overlay" onClick={() => setDeleteTarget(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>确认删除</h3>
            <p style={{ margin: '12px 0', color: '#64748b' }}>确定删除题库「{deleteTarget.title}」？此操作不可恢复。</p>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginTop: 16 }}>
              <button className="btn btn-outline" onClick={() => setDeleteTarget(null)}>取消</button>
              <button className="btn btn-danger" onClick={doDelete}>确认删除</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
