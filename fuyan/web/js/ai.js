/* 复研 · DeepSeek 抽屉（选区提问 / 自由追问 / 结果存为批注） */
import { state, $, esc, toast, openModal, closeModal } from './core.js';
import { aiChat, api } from './api.js';

let session = null; // { quote, anchor, sectionTitle, messages, noteId, onSaved }
let controller = null;

/** AI 是否已授权（有可用 Key）。没有就弹「启用 AI」引导，并返回 false。 */
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

const drawer = () => $('#drawer');
const body = () => $('#drawer-body');
const foot = () => $('#drawer-foot');

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
  b.innerHTML = session.messages
    .map((m) => {
      if (m.role === 'user') {
        return `<div class="ai-msg user"><div class="who">你</div><div class="bubble">${rich(m.content)}</div></div>`;
      }
      return `<div class="ai-msg assistant"><div class="who">DeepSeek</div><div class="bubble" id="ai-stream">${rich(m.content)}</div></div>`;
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
  if (el) el.innerHTML = rich(el.dataset.raw || '');
}

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

export function openDrawer({ quote = '', anchor = null, sectionTitle = '', initial = '', title = '问 DeepSeek' } = {}) {
  $('#drawer-title').textContent = title;
  drawer().hidden = false;
  $('#mask').hidden = false;
  foot().hidden = true;
  session = {
    quote,
    anchor,
    sectionTitle,
    messages: [],
    noteId: '',
    onSaved: null,
  };
  body().innerHTML = quote
    ? `<div class="note" style="margin-bottom:14px"><b>选中原文</b><br>${esc(quote)}</div>`
    : '';
  if (initial) ask(initial);
  else {
    body().insertAdjacentHTML('beforeend', `<div class="muted small">输入问题开始；也可以先在正文里选中一段文字再点「问 AI」，答案会自动存成批注。</div>`);
    foot().hidden = false;
    $('#drawer-input').focus();
  }
}

export function askWithSelection(info, sectionTitle, onSaved) {
  if (!ensureAi()) return;
  openDrawer({
    quote: info.text,
    anchor: info.anchor,
    sectionTitle,
    title: '问 DeepSeek',
  });
  if (onSaved) session.onSaved = onSaved;
  ask(`请解释并在考试语境下说明这段内容：\n「${info.text}」`);
}

export async function ask(text) {
  if (!session) return;
  foot().hidden = false;
  const userMsg = { role: 'user', content: text };
  session.messages.push(userMsg);
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
        messages: session.messages,
      },
      {
        signal: controller.signal,
        onDelta: (d) => appendStream(d),
      }
    );
    session.messages.push({ role: 'assistant', content: full });
    finishStream();
    saveNote(full);
  } catch (e) {
    finishStream();
    if (e.name !== 'AbortError') {
      const b = body();
      b.insertAdjacentHTML('beforeend', `<div class="verdict bad" style="margin-top:8px">${esc(e.message)}</div>`);
      scrollBottom();
    }
  } finally {
    btn.disabled = false;
    btn.textContent = '发送';
    controller = null;
  }
}

function saveNote(answer) {
  if (!session || !session.anchor) return;
  const { anchor, quote, messages } = session;
  const now = new Date().toISOString();
  const existing = state.notes.find((n) => n.id === session.noteId);
  if (existing) {
    existing.ai = { messages: messages.map((m) => ({ ...m })) };
    existing.updatedAt = now;
  } else {
    const id = 'a_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    const note = {
      id,
      kind: 'ai',
      anchor: { ...anchor },
      quote,
      note: '',
      ai: { messages: messages.map((m) => ({ ...m })) },
      createdAt: now,
      updatedAt: now,
    };
    state.notes.push(note);
    session.noteId = id;
  }
  import('./reader.js').then(({ persistNotes }) => persistNotes().catch(() => {}));
  import('./app.js').then(({ updateNoteCount }) => updateNoteCount());
}

export function openChat() {
  if (!ensureAi()) return;
  const section = state.reader && state.reader.sectionTitle ? state.reader.sectionTitle : '';
  openDrawer({
    quote: '',
    anchor: null,
    sectionTitle: section,
    title: '问 DeepSeek',
  });
}

export function bindDrawer() {
  $('#drawer-close').onclick = closeDrawer;
  $('#mask').onclick = closeDrawer;
  $('#drawer-send').onclick = () => {
    const v = $('#drawer-input').value.trim();
    if (v) ask(v);
  };
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
