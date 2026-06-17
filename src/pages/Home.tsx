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
  const [serverIP, setServerIP] = useState(() => localStorage.getItem('quiz_server_ip') || '')
  const [showServer, setShowServer] = useState(false)
  const [serverFiles, setServerFiles] = useState<{name:string,size:number}[]>([])
  const [downloading, setDownloading] = useState('')

  const refresh = useCallback(async () => {
    const list = await getAllBanks()
    setBanks(list)
  }, [])

  useEffect(() => { refresh() }, [refresh])

  // Listen for file from Android WebView
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
        id: bankId,
        title: result.title,
        fileName: file.name,
        totalCount: result.questions.length,
        createdAt: Date.now(),
      }

      const questions: Question[] = result.questions.map((q, i) => ({
        ...q,
        id: generateId(),
        bankId,
        index: i + 1,
      }))

      await saveBank(bank, questions)
      await refresh()
      alert(`导入成功！「${result.title}」共 ${result.questions.length} 题`)
    } catch (err) {
      console.error(err)
      alert('导入失败：' + (err instanceof Error ? err.message : '未知错误'))
    } finally {
      setLoading(false)
    }
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    setDragover(false)
    const file = e.dataTransfer.files[0]
    if (file) handleFile(file)
  }

  async function handleDelete(bankId: string, title: string) {
    if (!confirm(`确定删除题库「${title}」？\n所有题目和答题记录将被清除。`)) return
    await deleteBank(bankId)
    await refresh()
  }

  // Server connect: fetch available banks
  async function connectServer() {
    if (!serverIP.trim()) {
      alert('请输入电脑 IP 地址（如 192.168.1.5）')
      return
    }
    localStorage.setItem('quiz_server_ip', serverIP.trim())
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 5000)
    try {
      const url = `http://${serverIP.trim()}:8888/api/banks`
      const res = await fetch(url, { signal: controller.signal })
      const files = await res.json()
      setServerFiles(files)
      setShowServer(true)
    } catch (e) {
      alert('连接失败！请确认：\n1. 电脑和手机在同一 WiFi\n2. 电脑上已启动 server.cjs\n3. IP 地址正确')
    } finally {
      clearTimeout(timer)
    }
  }

  // Download from server and import
  async function downloadBank(name: string) {
    setDownloading(name)
    try {
      const url = `http://${serverIP.trim()}:8888/api/banks/${encodeURIComponent(name)}`
      const res = await fetch(url)
      const text = await res.text()
      const blob = new Blob([text], { type: 'text/markdown' })
      const file = new File([blob], name, { type: 'text/markdown' })
      await handleFile(file)
      setShowServer(false)
    } catch (e) {
      alert('下载失败：' + e)
    } finally {
      setDownloading('')
    }
  }

  async function checkUpdate() {
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), 8000)

    // 1. Try local server (same WiFi)
    if (serverIP.trim()) {
      try {
        const res = await fetch(`http://${serverIP.trim()}:8888/api/version`, { signal: ctrl.signal })
        const info = await res.json()
        if (info.apkAvailable) {
          if (confirm(`发现新版本\n构建: ${new Date(info.buildDate).toLocaleString()}\n从电脑下载？`)) {
            window.open(`http://${serverIP.trim()}:8888/api/apk`, '_blank')
          }
          clearTimeout(timer); return
        }
      } catch (e) {}
    }

    // 2. Try jsDelivr (CDN, works in China)
    try {
      const res = await fetch('https://cdn.jsdelivr.net/gh/Cheakerion/shauti-app@master/version.json', { signal: ctrl.signal })
      const info = await res.json()
      if (info.version) {
        const cur = localStorage.getItem('quiz_app_ver') || ''
        if (info.version !== cur) {
          if (confirm(`发现新版本 ${info.version}\n下载更新？`)) {
            localStorage.setItem('quiz_app_ver', info.version)
            window.open('https://github.com/Cheakerion/shauti-app/releases/latest', '_blank')
          }
        } else {
          alert('已是最新版本')
        }
        clearTimeout(timer); return
      }
    } catch (e) {}

    // 3. Direct GitHub releases page (usually accessible)
    alert('请访问 GitHub 下载最新版：\nhttps://github.com/Cheakerion/shauti-app/releases')
    clearTimeout(timer)
  }

  return (
    <div>
      <div className="home-header">
        <h1>📝 刷题</h1>
        <p>导入你的题库，开始刷题</p>
      </div>

      {/* Server IP config */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 12, alignItems: 'center' }}>
        <input
          type="text"
          placeholder="电脑 IP (如 192.168.1.5)"
          value={serverIP}
          onChange={(e) => setServerIP(e.target.value)}
          style={{ flex: 1, padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border)', fontSize: '0.85rem' }}
        />
        <button className="btn btn-sm btn-outline" onClick={connectServer}>📥 从电脑下载</button>
        <button className="btn btn-sm btn-outline" onClick={checkUpdate}>🔄</button>
      </div>

      {/* Upload zone */}
      <label
        className={`drop-zone ${dragover ? 'dragover' : ''}`}
        onDragOver={(e) => { e.preventDefault(); setDragover(true) }}
        onDragLeave={() => setDragover(false)}
        onDrop={handleDrop}
      >
        <div style={{ fontSize: '2rem', marginBottom: 8 }}>📂</div>
        <div>{loading ? '导入中...' : '点击选择 .md 题库文件'}</div>
        <div style={{ fontSize: '0.8rem', marginTop: 4 }}>
          或输入电脑 IP 后从电脑下载
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept=".md,.txt,.text/*"
          disabled={loading}
          onChange={(e) => {
            if ((window as any).__hermesFilePending) {
              delete (window as any).__hermesFilePending
              e.target.value = ''
              return
            }
            const file = e.target.files?.[0]
            if (file) handleFile(file)
            e.target.value = ''
          }}
        />
      </label>

      {/* Bank list */}
      {banks.length === 0 ? (
        <div className="empty-state">
          <div className="icon">📭</div>
          <h3>还没有题库</h3>
          <p>上传 .md 文件或从电脑下载</p>
        </div>
      ) : (
        banks.map((bank) => (
          <div className="card bank-card" key={bank.id}>
            <div className="bank-title">{bank.title}</div>
            <div className="bank-meta">
              {bank.fileName} · {bank.totalCount} 题
              {bank.lastScore && (
                <> · 最近正确率 {Math.round((bank.lastScore.correct / bank.lastScore.total) * 100)}%</>
              )}
            </div>
            <div className="bank-actions">
              <button className="btn" onClick={() => navigate(`/quiz/${bank.id}`)}>开始刷题</button>
              <button className="btn btn-outline btn-sm" onClick={() => navigate(`/wrong/${bank.id}`)}>错题本</button>
              <button className="btn btn-outline btn-sm" style={{ color: '#dc2626', borderColor: '#dc2626' }}
                onClick={() => handleDelete(bank.id, bank.title)}>删除</button>
            </div>
          </div>
        ))
      )}

      {/* Server file list modal */}
      {showServer && (
        <div className="modal-overlay" onClick={() => setShowServer(false)}>
          <div className="modal" style={{ maxWidth: 420, textAlign: 'left' }} onClick={e => e.stopPropagation()}>
            <h3>📥 从电脑下载题库</h3>
            {serverFiles.length === 0 ? (
              <p style={{ color: 'var(--text-secondary)', textAlign: 'center', padding: 20 }}>电脑上没有题库文件</p>
            ) : (
              <div style={{ maxHeight: 300, overflowY: 'auto' }}>
                {serverFiles.map(f => (
                  <div key={f.name} className="card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px' }}>
                    <div>
                      <div style={{ fontWeight: 500 }}>{f.name}</div>
                      <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{(f.size/1024).toFixed(1)} KB</div>
                    </div>
                    <button className="btn btn-sm" disabled={downloading === f.name}
                      onClick={() => downloadBank(f.name)}>
                      {downloading === f.name ? '下载中...' : '下载'}
                    </button>
                  </div>
                ))}
              </div>
            )}
            <button className="btn btn-outline btn-block mt-16" onClick={() => setShowServer(false)}>关闭</button>
          </div>
        </div>
      )}
    </div>
  )
}
