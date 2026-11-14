/* 复研 · 接口封装（全部同源） */

async function req(method, url, body) {
  const opt = { method, headers: {} };
  if (body !== undefined) {
    opt.headers['Content-Type'] = 'application/json';
    opt.body = JSON.stringify(body);
  }
  const res = await fetch(url, opt);
  let data = null;
  try { data = await res.json(); } catch (_) {}
  if (!res.ok || (data && data.ok === false)) {
    const msg = (data && data.error) || `请求失败 (${res.status})`;
    const err = new Error(msg);
    err.data = data;
    throw err;
  }
  return data;
}

export const api = {
  health: () => req('GET', '/api/health'),
  getConfig: () => req('GET', '/api/config'),
  saveConfig: (patch) => req('PUT', '/api/config', patch),
  listArchives: () => req('GET', '/api/archives'),
  getArchive: (id) => req('GET', `/api/archives/${encodeURIComponent(id)}`),
  getQuestions: (id) => req('GET', `/api/archives/${encodeURIComponent(id)}/questions`),
  deleteArchive: (id) => req('DELETE', `/api/archives/${encodeURIComponent(id)}`),
  pickImport: (kind) => req('POST', '/api/archives/pick', { kind }),
  importPath: (p) => req('POST', '/api/archives/import', { path: p }),
  importUrl: (url) => req('POST', '/api/archives/import-url', { url }),
  catalog: () => req('GET', '/api/archives/catalog'),
  publishArchive: (id) => req('POST', `/api/archives/${encodeURIComponent(id)}/publish`),
  exportArchive: (id) => req('POST', `/api/archives/${encodeURIComponent(id)}/export`),
  checkArchiveUpdate: (id) => req('POST', `/api/archives/${encodeURIComponent(id)}/check-update`),
  getNotes: (id) => req('GET', `/api/archives/${encodeURIComponent(id)}/notes`),
  putNotes: (id, items) => req('PUT', `/api/archives/${encodeURIComponent(id)}/notes`, { items }),
  getProgress: (id) => req('GET', `/api/archives/${encodeURIComponent(id)}/progress`),
  putProgress: (id, patch) => req('PUT', `/api/archives/${encodeURIComponent(id)}/progress`, patch),
  resetProgress: (id, what) => req('POST', `/api/archives/${encodeURIComponent(id)}/reset`, { what }),
  quarkStatus: () => req('GET', '/api/quark/status'),
  quarkList: () => req('GET', '/api/quark/list'),
  quarkPull: (file) => req('POST', '/api/quark/pull', file),
  aiTest: () => req('POST', '/api/ai/test'),
  appUpdate: () => req('GET', '/api/app/update'),
  reveal: (p) => req('POST', '/api/reveal', { path: p }),
  quit: () => req('POST', '/api/quit', {}),
  openExternal: (url) => req('POST', '/api/open-external', { url }),
};

/** DeepSeek 流式问答：onDelta(text), 返回完整文本 */
export async function aiChat({ archiveId, sectionTitle, quote, messages }, { onDelta, signal } = {}) {
  const res = await fetch('/api/ai/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ archiveId, sectionTitle, quote, messages }),
    signal,
  });
  if (!res.ok || !res.body) throw new Error('AI 请求失败 (' + res.status + ')');
  const reader = res.body.getReader();
  const decoder = new TextDecoder('utf-8');
  let buf = '';
  let full = '';
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const parts = buf.split('\n\n');
    buf = parts.pop();
    for (const part of parts) {
      const line = part.split('\n').find((l) => l.startsWith('data:'));
      if (!line) continue;
      let obj;
      try { obj = JSON.parse(line.slice(5).trim()); } catch (_) { continue; }
      if (obj.type === 'delta') {
        full += obj.text;
        onDelta && onDelta(obj.text, full);
      } else if (obj.type === 'error') {
        throw new Error(obj.message || 'AI 出错');
      } else if (obj.type === 'done') {
        if (obj.text && !full) full = obj.text;
      }
    }
  }
  return full;
}
