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

  const [updateSuccess, setUpdateSuccess] = useState<string | null>(null)

  const [downloadDone, setDownloadDone] = useState(false)

  // 启动时自动检测更新 & 更新成功提示
  useEffect(() => {
    const pending = localStorage.getItem('quiz_pending_update')
    if (pending) {
      localStorage.removeItem('quiz_pending_update')
      setUpdateSuccess(pending)
    }
    autoCheckUpdate()
  }, [])

  // 三保险取版本：GitHub API（零缓存）→ Raw 源 → CDN
  async function fetchVersionUrl(): Promise<string | null> {
    const ts = Date.now()

    // 方案 1: GitHub API raw 模式（零缓存）
    try {
      const res = await fetch(
        `https://api.github.com/repos/Cheakerion/shauti-app/contents/version.json?ref=master&t=${ts}`,
        { cache: 'no-store', headers: { Accept: 'application/vnd.github.raw+json' } }
      )
      if (res.ok) return (await res.json()).version
    } catch (_) { /* 下一个 */ }

    // 方案 2: raw.githubusercontent.com
    try {
      const res = await fetch(
        `https://raw.githubusercontent.com/Cheakerion/shauti-app/master/version.json?t=${ts}`,
        { cache: 'no-store' }
      )
      if (res.ok) return (await res.json()).version
    } catch (_) { /* 下一个 */ }

    // 方案 3: jsDelivr CDN（最后兜底）
    try {
      const res = await fetch(
        `https://cdn.jsdelivr.net/gh/Cheakerion/shauti-app@master/version.json?t=${ts}`,
        { cache: 'no-store' }
      )
      if (res.ok) return (await res.json()).version
    } catch (_) { /* 下一个 */ }

    return null
  }

  async function autoCheckUpdate() {
    const latestVer = await fetchVersionUrl()
    if (!latestVer) return
    let cur = localStorage.getItem('quiz_app_ver') || ''
    if (!cur && latestVer) { localStorage.setItem('quiz_app_ver', latestVer); cur = latestVer }
    if (latestVer && newer(latestVer, cur || '0')) {
      setUpdateVer(latestVer)
    }
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

    const getAndroidVer = (): string | null => {
      try {
        if (Android?.checkVersion) {
          const v = Android.checkVersion()
          if (v && !v.startsWith('ERR:')) return v
        }
      } catch (e) {}
      return null
    }

    const [androidVer, fetchVer] = await Promise.all([
      Promise.resolve(getAndroidVer()),
      fetchVersionUrl(),
    ])

    let latestVer = ''
    for (const v of [androidVer, fetchVer]) {
      if (v && newer(v, latestVer || '0')) latestVer = v
    }

    if (!latestVer) { alert('检测失败：无法获取版本信息，请检查网络'); return }
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
    localStorage.setItem('quiz_app_ver', ver)
    localStorage.setItem('quiz_pending_update', ver)
    setDownloadDone(true)

    const apkUrl = 'https://raw.githubusercontent.com/Cheakerion/shauti-app/master/releases/shuati.apk'
    const AppUpdate = (window as any).AppUpdate
    if (AppUpdate?.download) {
      AppUpdate.download(apkUrl)
    } else {
      window.location.href = apkUrl
    }
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
          <button className="btn btn-sm" onClick={() => { if (confirm(`下载 v${updateVer}？`)) handleDownload(updateVer) }}>下载更新</button>
          <button className="btn btn-sm btn-outline" onClick={() => setUpdateVer(null)}>✕</button>
        </div>
      )}

      {updateSuccess && (
        <div className="update-banner" style={{ background: '#dcfce7', borderColor: '#16a34a' }}>
          <span style={{ color: '#16a34a' }}>✅ 已更新到 v{updateSuccess}</span>
          <button className="btn btn-sm btn-outline" onClick={() => setUpdateSuccess(null)}>✕</button>
        </div>
      )}
      {downloadDone && (
        <div className="update-banner" style={{ background: '#dcfce7', borderColor: '#16a34a' }}>
          <span style={{ color: '#16a34a' }}>✅ 下载完成，请下拉通知栏安装更新</span>
          <button className="btn btn-sm btn-outline" onClick={() => setDownloadDone(false)}>✕</button>
        </div>
      )}

      <div className="home-header">
        <h1>📝 刷题 <span style={{ fontSize: '0.7rem', color: '#94a3b8', fontWeight: 400 }}>v{localStorage.getItem('quiz_app_ver') || '1.0'}</span></h1>
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
