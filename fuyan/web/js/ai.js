/* 复研 · DeepSeek 抽屉（选区提问 / 自由追问 / 结果存为批注）
 *
 * 三条规矩：
 * 1) 同一段选区只对应一条 AI 批注：再问就接在后面，不新开一条；
 * 2) 每次提问都带上这条批注里之前的全部消息，上下文不断；
 * 3) 对话写进 data 目录（不在程序目录里），关掉软件、换新版本都还在。
 */
import { state, $, esc, toast, openModal, closeModal, fmtDate } from './core.js';
import { aiChat, api } from './api.js';

let session = null; // { quote, anchor, sectionTitle, mode, noteId, threadId, messages, loadingThread }
let controller = null;
let threads = []; // 无选区的自由对话（选区对话存在批注里）

const drawer = () => $('#drawer');
const body = () => $('#drawer-body');
const foot = () => $('#drawer-foot');

/* ---------------------------------------------------------------- AI 门禁 */
export function ensureAi() {
  if (state.aiReady) return true;
  showAiGate();
  return false;
}

export function showAiGate() {
  openModal(
    `<h3>先启用 AI 功能</h3>
     <p class="sub">DeepSeek 官方接口没有「扫码登录」这种授权方式，必须用一个 API Key（用你自己的账号扣费）。
        Key 只保存在本机，请求由本地服务转发，网页里拿不到。</p>
     <ol style="font-size:13px;line-height:2;color:var(--ink-2);padding-left:18px;margin:6px 0 14px">
       <li>打开 DeepSeek 开放平台（需要登录你的 DeepSeek 账号）</li>
       <li>创建 API Key（<code>sk-…</code>）</li>
       <li>回「设置 → DeepSeek」粘贴、保存，点「测试连接」</li>
     </ol>
     <div class="note">如果你是想「扫码就能用、按作者账号统一扣费」，那需要作者自己搭一个后端账号体系（见 docs/TODO.md 第 5 节）。</div>
     <div class="foot">
       <button class="btn" data-g="close">稍后</button>
       <button class="btn" data-g="open">打开开放平台</button>
       <button class="btn primary" data-g="settings">去设置填 Key</button>
     </div>`,
    {
      onMount(box) {
        box.querySelector('[data-g=close]').onclick = closeModal;
        box.querySelector('[data-g=open]').onclick = () => {
          api.openExternal('https://platform.deepseek.com/api_keys').catch(() => {});
        };
        box.querySelector('[data-g=settings]').onclick = () => {
          closeModal();
          location.hash = '#/settings';
        };
      },
    }
  );
}

/* ---------------------------------------------------------------- 工具 */
const anchorKey = (a) => (a ? `${a.start}:${a.end}` : '');
const msgCount = (n) => ((n.ai && n.ai.messages) || []).length;

function aiNotes() {
  return (state.notes || []).filter((n) => n.kind === 'ai' && n.anchor);
}

/** 同一段文字对应的 AI 批注（先按 anchor，再退回 quote） */
export function findAiNote(anchor, quote) {
  const key = anchorKey(anchor);
  return (
    aiNotes().find((n) => anchorKey(n.anchor) === key) ||
    aiNotes().find((n) => quote && n.quote === quote) ||
    null
  );
}

/** 以前重复点同一个词会叠出多条 AI 批注：这里合并成一条，消息按时间接起来 */
export async function mergeDuplicateAiNotes() {
  const groups = new Map();
  for (const n of aiNotes()) {
    const k = anchorKey(n.anchor) || 'q:' + n.quote;
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(n);
  }
  let removed = 0;
  for (const list of groups.values()) {
    if (list.length < 2) continue;
    list.sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));
    const keep = list[0];
    const seen = new Set();
    const merged = [];
    for (const n of list) {
      for (const m of (n.ai && n.ai.messages) || []) {
        const sig = m.role + '|' + (m.content || '');
        if (seen.has(sig)) continue;
        seen.add(sig);
        merged.push(m);
      }
      keep.updatedAt = [keep.updatedAt, n.updatedAt].filter(Boolean).sort().pop();
    }
    keep.ai = { messages: merged };
    for (const n of list.slice(1)) {
      const i = state.notes.indexOf(n);
      if (i >= 0) state.notes.splice(i, 1);
      removed++;
    }
  }
  if (removed) {
    try {
      await api.putNotes(state.archiveId, state.notes);
      toast(`已把重复的 AI 批注合并成 ${groups.size} 条`, 'ok');
    } catch (_) {}
  }
  return removed;
}

function scrollBottom() {
  const b = body();
  b.scrollTop = b.scrollHeight;
}

function rich(text) {
  const s = esc(text || '');
  return s
    .replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>')
    .replace(/^###?\s+(.+)$/gm, '<b>$1</b>')
    .replace(/^\s*[-•]\s+/gm, '· ');
}

function renderMessages() {
  const b = body();
  const head = session.quote
    ? `<div class="note ai-quote"><b>选中原文</b><br>${esc(session.quote)}</div>`
    : '';
  const hint =
    session.messages.length && session.noteId
      ? `<div class="muted small" style="margin:8px 0 12px">这条批注之前聊过 ${Math.floor(session.messages.length / 2)} 轮，继续问会接在后面。</div>`
      : '';
  b.innerHTML =
    head +
    hint +
    session.messages
      .map((m) => {
        if (m.role === 'user') {
          return `<div class="ai-msg user"><div class="who">你</div><div class="bubble">${rich(m.content)}</div></div>`;
        }
        return `<div class="ai-msg assistant"><div class="who">DeepSeek</div><div class="bubble">${rich(m.content)}</div></div>`;
      })
      .join('');
  scrollBottom();
}

function appendStream(text) {
  let el = $('#ai-stream');
  if (!el) {
    const b = body();
    b.insertAdjacentHTML('beforeend', `<div class="ai-msg assistant"><div class="who">DeepSeek</div><div class="bubble" id="ai-stream"></div></div>`);
    el = $('#ai-stream');
  }
  el.dataset.raw = (el.dataset.raw || '') + text;
  el.innerHTML = rich(el.dataset.raw) + '<span class="caret"></span>';
  scrollBottom();
}

function finishStream() {
  const el = $('#ai-stream');
  if (el) {
    el.innerHTML = rich(el.dataset.raw || '');
    el.removeAttribute('id');
    el.removeAttribute('data-raw');
  }
}

/* ---------------------------------------------------------------- 对话存储 */
async function loadThreads() {
  if (!state.archiveId) return;
  try {
    const r = await api.getAiThreads(state.archiveId);
    threads = (r.threads && r.threads.items) || [];
  } catch (_) {
    threads = [];
  }
}

async function saveThreads() {
  if (!state.archiveId) return;
  try {
    await api.putAiThreads(state.archiveId, threads);
  } catch (e) {
    toast('对话记录保存失败：' + e.message, 'bad');
  }
}

function upsertThread() {
  const now = new Date().toISOString();
  const first = session.messages.find((m) => m.role === 'user');
  let t = threads.find((x) => x.id === session.threadId);
  if (!t) {
    t = {
      id: 't_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      title: (first && first.content) || '对话',
      section: session.sectionTitle || '',
      messages: [],
      createdAt: now,
      updatedAt: now,
    };
    threads.unshift(t);
    session.threadId = t.id;
  }
  t.messages = session.messages.map((m) => ({ ...m }));
  t.updatedAt = now;
  threads.sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
  return saveThreads();
}

function upsertNote() {
  if (!session.anchor) return null;
  const now = new Date().toISOString();
  let note = state.notes.find((n) => n.id === session.noteId);
  if (!note) note = findAiNote(session.anchor, session.quote);
  if (!note) {
    note = {
      id: 'a_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      kind: 'ai',
      anchor: { ...session.anchor },
      quote: session.quote,
      note: '',
      ai: { messages: [] },
      section: session.sectionTitle || '',
      createdAt: now,
      updatedAt: now,
    };
    state.notes.push(note);
  }
  note.quote = session.quote || note.quote;
  note.anchor = { ...(session.anchor || note.anchor) };
  note.ai = { messages: session.messages.map((m) => ({ ...m })) };
  note.updatedAt = now;
  session.noteId = note.id;
  import('./reader.js').then(({ persistNotes }) => persistNotes().catch(() => {}));
  import('./app.js').then(({ updateNoteCount }) => updateNoteCount());
  return note;
}

function persistSession() {
  if (!session) return;
  if (session.anchor) upsertNote();
  else upsertThread();
}

/* ---------------------------------------------------------------- 抽屉 */
export function closeDrawer() {
  if (controller) {
    try { controller.abort(); } catch (_) {}
    controller = null;
  }
  drawer().hidden = true;
  $('#mask').hidden = true;
  foot().hidden = true;
  session = null;
}

function renderHistory(emptyText) {
  const items = [];
  for (const n of aiNotes()) {
    items.push({
      kind: 'note',
      id: n.id,
      title: n.quote || '（无原文）',
      sub: `${Math.floor(msgCount(n) / 2)} 轮 · ${fmtDate(n.updatedAt || n.createdAt)}`,
      at: n.updatedAt || n.createdAt,
    });
  }
  for (const t of threads) {
    const q = (t.messages.find((m) => m.role === 'user') || {}).content || t.title || '对话';
    items.push({
      kind: 'thread',
      id: t.id,
      title: q,
      sub: `${Math.floor(t.messages.length / 2)} 轮 · ${fmtDate(t.updatedAt || t.createdAt)}`,
      at: t.updatedAt || t.createdAt,
    });
  }
  items.sort((a, b) => String(b.at).localeCompare(String(a.at)));
  body().innerHTML =
    `<div class="muted small" style="margin-bottom:10px">${emptyText || '最近的对话，点一条继续。'}</div>` +
    (items.length
      ? `<div class="ai-hist">${items
          .slice(0, 40)
          .map(
            (it) =>
              `<button class="ai-hist-item" data-k="${it.kind}" data-id="${esc(it.id)}">
                 <span class="t">${esc(it.title).slice(0, 60)}</span>
                 <span class="s">${esc(it.sub)}${it.kind === 'thread' ? ' · 自由对话' : ' · 批注'}</span>
               </button>`
          )
          .join('')}</div>`
      : `<div class="note">还没有对话。选中正文里的文字点「问 DeepSeek」，或者直接在下面输入。</div>`);
  body().querySelectorAll('.ai-hist-item').forEach((el) => {
    el.onclick = () => {
      if (el.dataset.k === 'note') openNoteThread(el.dataset.id);
      else openThread(el.dataset.id);
    };
  });
  foot().hidden = false;
}

function openNoteThread(noteId) {
  const note = state.notes.find((n) => n.id === noteId);
  if (!note) return;
  session = {
    quote: note.quote || '',
    anchor: note.anchor || null,
    sectionTitle: note.section || '',
    mode: 'concept',
    noteId: note.id,
    threadId: '',
    messages: ((note.ai && note.ai.messages) || []).map((m) => ({ ...m })),
    loadingThread: false,
  };
  renderMessages();
  foot().hidden = false;
  $('#drawer-input').focus();
}

function openThread(threadId) {
  const t = threads.find((x) => x.id === threadId);
  if (!t) return;
  session = {
    quote: '',
    anchor: null,
    sectionTitle: t.section || '',
    mode: 'concept',
    noteId: '',
    threadId: t.id,
    messages: (t.messages || []).map((m) => ({ ...m })),
    loadingThread: false,
  };
  renderMessages();
  foot().hidden = false;
  $('#drawer-input').focus();
}

export function openDrawer({ quote = '', anchor = null, sectionTitle = '', initial = '', title = '问 DeepSeek', showHistory = false } = {}) {
  $('#drawer-title').textContent = title;
  drawer().hidden = false;
  $('#mask').hidden = false;
  foot().hidden = true;
  const existing = quote && anchor ? findAiNote(anchor, quote) : null;
  session = {
    quote,
    anchor,
    sectionTitle,
    mode: 'concept',
    noteId: existing ? existing.id : '',
    threadId: '',
    messages: existing ? ((existing.ai && existing.ai.messages) || []).map((m) => ({ ...m })) : [],
    loadingThread: false,
  };
  if (existing) {
    renderMessages();
    foot().hidden = false;
    $('#drawer-input').focus();
    return;
  }
  if (showHistory) {
    renderHistory();
    $('#drawer-input').focus();
    return;
  }
  body().innerHTML = quote
    ? `<div class="note ai-quote"><b>选中原文</b><br>${esc(quote)}</div>
       <div class="muted small" style="margin-top:10px">直接回车，会先给一个简短解释；继续问就接在这条批注后面。</div>`
    : `<div class="muted small">输入问题开始；也可以先在正文里选中一段文字再点「问 DeepSeek」，答案会自动存成批注。</div>`;
  foot().hidden = false;
  $('#drawer-input').focus();
}

/* ---------------------------------------------------------------- 提问 */
export function askWithSelection(info, sectionTitle, onSaved) {
  if (!ensureAi()) return;
  const existing = findAiNote(info.anchor, info.text);
  openDrawer({ quote: info.text, anchor: info.anchor, sectionTitle, title: '问 DeepSeek' });
  if (onSaved) session.onSaved = onSaved;
  // 同一个词已经查过：直接展示原来的对话，接着问就往后追加
  if (!existing) ask(`解释「${info.text}」`);
}

export async function ask(text) {
  if (!session) return;
  foot().hidden = false;
  session.messages.push({ role: 'user', content: text });
  renderMessages();
  $('#drawer-input').value = '';
  controller = new AbortController();
  const btn = $('#drawer-send');
  btn.disabled = true;
  btn.textContent = '回答中…';
  let full = '';
  try {
    full = await aiChat(
      {
        archiveId: state.archiveId,
        sectionTitle: session.sectionTitle,
        quote: session.quote,
        mode: session.mode,
        // 关键：带上这条批注之前的全部消息，追问才有上下文
        messages: session.messages,
      },
      {
        signal: controller.signal,
        onDelta: (d) => appendStream(d),
      }
    );
    session.messages.push({ role: 'assistant', content: full });
    finishStream();
    persistSession();
    if (session.onSaved) session.onSaved(full);
  } catch (e) {
    finishStream();
    if (e.name !== 'AbortError') {
      body().insertAdjacentHTML('beforeend', `<div class="verdict bad" style="margin-top:8px">${esc(e.message)}</div>`);
      scrollBottom();
    }
  } finally {
    btn.disabled = false;
    btn.textContent = '发送';
    controller = null;
  }
}

export async function openChat() {
  if (!ensureAi()) return;
  const section = state.reader && state.reader.sectionTitle ? state.reader.sectionTitle : '';
  await loadThreads();
  openDrawer({ quote: '', anchor: null, sectionTitle: section, title: '问 DeepSeek', showHistory: true });
}

export async function openHistory() {
  await loadThreads();
  openDrawer({ quote: '', anchor: null, sectionTitle: '', title: '对话记录', showHistory: true });
  $('#drawer-title').textContent = '对话记录';
}

export function bindDrawer() {
  $('#drawer-close').onclick = closeDrawer;
  $('#mask').onclick = closeDrawer;
  $('#drawer-send').onclick = () => {
    const v = $('#drawer-input').value.trim();
    if (v) ask(v);
  };
  const hist = $('#drawer-history');
  if (hist) hist.onclick = () => openHistory();
  $('#drawer-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      const v = e.target.value.trim();
      if (v) ask(v);
    }
  });
  $('#drawer-input').addEventListener('input', (e) => {
    e.target.style.height = 'auto';
    e.target.style.height = Math.min(120, e.target.scrollHeight) + 'px';
  });
}
