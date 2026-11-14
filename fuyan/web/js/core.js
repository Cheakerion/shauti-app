/* 复研 · 前端基础：状态、事件、DOM 小工具、提示条 */

export const state = {
  archives: [],
  archiveId: '',
  manifest: null,
  questions: [],
  notes: [],
  progress: null,
  theme: 'light',
  config: null,
  reader: null, // 当前阅读器实例（供搜索/批注跳转）
  aiReady: false, // 是否已配置可用的 DeepSeek Key
  archiveUpdates: {}, // 网盘存档更新检查结果
};

const listeners = new Map();
export function on(evt, fn) {
  if (!listeners.has(evt)) listeners.set(evt, new Set());
  listeners.get(evt).add(fn);
  return () => listeners.get(evt).delete(fn);
}
export function emit(evt, data) {
  const set = listeners.get(evt);
  if (set) for (const fn of [...set]) {
    try { fn(data); } catch (e) { console.error('[emit]', evt, e); }
  }
}

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

export function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/** 在文本里标出命中词（用于搜索预览） */
export function markHits(text, terms, max = 160) {
  let t = String(text || '').replace(/\s+/g, ' ');
  if (!terms || !terms.length) return esc(t.slice(0, max));
  const low = t.toLowerCase();
  let first = -1;
  for (const term of terms) {
    const i = low.indexOf(term.toLowerCase());
    if (i >= 0 && (first < 0 || i < first)) first = i;
  }
  let start = Math.max(0, first - 30);
  if (first < 0) start = 0;
  let out = t.slice(start, start + max);
  let html = esc(out);
  for (const term of terms) {
    if (!term) continue;
    const re = new RegExp(escRe(term), 'gi');
    html = html.replace(re, (m) => `<mark>${m}</mark>`);
  }
  return (start > 0 ? '…' : '') + html + (start + max < t.length ? '…' : '');
}

export function escRe(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function debounce(fn, ms = 250) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}

export function fmtNum(n) {
  if (n == null) return '—';
  return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

export function fmtTime(sec) {
  sec = Math.max(0, Math.round(sec || 0));
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return m > 0 ? `${m} 分 ${s} 秒` : `${s} 秒`;
}

export function fmtDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d)) return iso;
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

export function timeAgo(iso) {
  if (!iso) return '';
  const t = new Date(iso).getTime();
  if (isNaN(t)) return '';
  const diff = (Date.now() - t) / 1000;
  if (diff < 60) return '刚刚';
  if (diff < 3600) return `${Math.floor(diff / 60)} 分钟前`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} 小时前`;
  return `${Math.floor(diff / 86400)} 天前`;
}

/* ---------------------------------------------------------------- 提示条 */
export function toast(msg, type = '', ms = 2400) {
  const wrap = $('#toast-wrap');
  if (!wrap) return;
  const el = document.createElement('div');
  el.className = 'toast ' + type;
  el.textContent = msg;
  wrap.appendChild(el);
  setTimeout(() => {
    el.style.transition = 'opacity .25s, transform .25s';
    el.style.opacity = '0';
    el.style.transform = 'translateY(6px)';
    setTimeout(() => el.remove(), 260);
  }, ms);
}

/* ---------------------------------------------------------------- 弹窗 */
let modalClose = null;
export function openModal(html, { onMount, closable = true, wide = false } = {}) {
  closeModal();
  const root = $('#modal-root');
  const mask = document.createElement('div');
  mask.className = 'mask';
  mask.addEventListener('click', () => closable && closeModal());
  const box = document.createElement('div');
  box.className = 'modal';
  if (wide) box.style.width = 'min(760px,94vw)';
  box.innerHTML = html;
  root.appendChild(mask);
  root.appendChild(box);
  const onKey = (e) => {
    if (e.key === 'Escape' && closable) closeModal();
  };
  document.addEventListener('keydown', onKey);
  modalClose = () => {
    document.removeEventListener('keydown', onKey);
    mask.remove();
    box.remove();
    modalClose = null;
  };
  if (onMount) onMount(box);
  const first = box.querySelector('textarea,input,button.primary');
  if (first) setTimeout(() => first.focus(), 30);
  return box;
}
export function closeModal() {
  if (modalClose) modalClose();
}

export function confirmDialog(title, message, { okText = '确定', danger = false } = {}) {
  return new Promise((resolve) => {
    openModal(
      `<h3>${esc(title)}</h3><p class="sub">${esc(message)}</p>
       <div class="foot"><button class="btn" data-act="cancel">取消</button>
       <button class="btn ${danger ? 'danger' : 'primary'}" data-act="ok">${esc(okText)}</button></div>`,
      {
        onMount(box) {
          box.querySelector('[data-act=cancel]').onclick = () => { closeModal(); resolve(false); };
          box.querySelector('[data-act=ok]').onclick = () => { closeModal(); resolve(true); };
        },
      }
    );
  });
}

/* ---------------------------------------------------------------- 主题 */
export function applyTheme(theme) {
  const t = theme === 'auto'
    ? (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
    : theme;
  document.documentElement.dataset.theme = t;
  state.theme = t;
  const btn = $('#btn-theme');
  if (btn) btn.textContent = t === 'dark' ? '☀' : '◐';
  // 通知阅读器把主题同步进 iframe（存档内容里也有 [data-theme="dark"]）
  try {
    window.dispatchEvent(new CustomEvent('fuyan:theme', { detail: t }));
  } catch (_) {}
}

export function toggleTheme() {
  const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
  applyTheme(next);
  try { localStorage.setItem('fuyan.theme', next); } catch (_) {}
  if (state.config) {
    import('./api.js').then(({ api }) => api.saveConfig({ ui: { theme: next } }).catch(() => {}));
  }
}
